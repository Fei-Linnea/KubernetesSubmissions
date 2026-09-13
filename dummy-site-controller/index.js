const k8s = require("@kubernetes/client-node");

const GROUP = "dummy-sites.dev";
const VERSION = "v1";
const PLURAL = "dummysites";
const MAX_SITE_SIZE = 900 * 1024;
const RESOURCE_LABEL = "dummy-sites.dev/managed-by";
const RESOURCE_VALUE = "dummy-site-controller";

const kc = new k8s.KubeConfig();
kc.loadFromCluster();

const customObjectsApi = kc.makeApiClient(k8s.CustomObjectsApi);
const coreApi = kc.makeApiClient(k8s.CoreV1Api);
const appsApi = kc.makeApiClient(k8s.AppsV1Api);
const networkingApi = kc.makeApiClient(k8s.NetworkingV1Api);
const watcher = new k8s.Watch(kc);

function resourceName(siteName) {
  const normalized = siteName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `dummysite-${normalized}`.slice(0, 63).replace(/-+$/, "");
}

function ownerReference(site) {
  return {
    apiVersion: `${GROUP}/${VERSION}`,
    kind: "DummySite",
    name: site.metadata.name,
    uid: site.metadata.uid,
    controller: true,
    blockOwnerDeletion: true,
  };
}

function labels(site) {
  return {
    [RESOURCE_LABEL]: RESOURCE_VALUE,
    "dummy-sites.dev/name": site.metadata.name,
  };
}

async function fetchWebsite(url) {
  const parsedUrl = new URL(url);
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("website_url must use http:// or https://");
  }

  const response = await fetch(parsedUrl, {
    signal: AbortSignal.timeout(30_000),
    headers: {
      "User-Agent": "dummy-site-controller/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Website returned HTTP ${response.status}`);
  }

  const html = await response.text();
  if (Buffer.byteLength(html, "utf8") > MAX_SITE_SIZE) {
    throw new Error(`Website is larger than ${MAX_SITE_SIZE} bytes`);
  }

  return html;
}

async function createOrReplace(read, create, replace, resource) {
  try {
    const existing = await read(resource.metadata.name, resource.metadata.namespace);
    await replace(
      resource.metadata.name,
      resource.metadata.namespace,
      {
        ...resource,
        metadata: {
          ...resource.metadata,
          resourceVersion: existing.body.metadata.resourceVersion,
        },
      }
    );
  } catch (error) {
    if (error.response?.statusCode !== 404) {
      throw error;
    }
    await create(resource.metadata.namespace, resource);
  }
}

function buildResources(site, html) {
  const namespace = site.metadata.namespace;
  const name = resourceName(site.metadata.name);
  const owner = ownerReference(site);
  const siteLabels = labels(site);

  const metadata = {
    name,
    namespace,
    labels: siteLabels,
    ownerReferences: [owner],
  };

  return {
    configMap: {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata,
      data: {
        "index.html": html,
      },
    },
    deployment: {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata,
      spec: {
        replicas: 1,
        selector: { matchLabels: siteLabels },
        template: {
          metadata: { labels: siteLabels },
          spec: {
            containers: [
              {
                name: "web",
                image: "nginx:1.27-alpine",
                ports: [{ name: "http", containerPort: 80 }],
                volumeMounts: [
                  {
                    name: "site-content",
                    mountPath: "/usr/share/nginx/html/index.html",
                    subPath: "index.html",
                    readOnly: true,
                  },
                ],
              },
            ],
            volumes: [
              {
                name: "site-content",
                configMap: { name },
              },
            ],
          },
        },
      },
    },
    service: {
      apiVersion: "v1",
      kind: "Service",
      metadata,
      spec: {
        selector: siteLabels,
        ports: [{ name: "http", port: 80, targetPort: "http" }],
      },
    },
    ingress: {
      apiVersion: "networking.k8s.io/v1",
      kind: "Ingress",
      metadata: {
        ...metadata,
        annotations: {
          "dummy-sites.dev/website-url": site.spec.website_url,
        },
      },
      spec: {
        rules: [
          {
            host: `${name}.localhost`,
            http: {
              paths: [
                {
                  path: "/",
                  pathType: "Prefix",
                  backend: {
                    service: { name, port: { number: 80 } },
                  },
                },
              ],
            },
          },
        ],
      },
    },
  };
}

async function reconcile(site) {
  if (!site.metadata?.uid || !site.spec?.website_url) {
    console.error("Ignoring malformed DummySite event");
    return;
  }

  const namespace = site.metadata.namespace || "default";
  const resources = buildResources(site, await fetchWebsite(site.spec.website_url));

  await createOrReplace(
    (name, ns) => coreApi.readNamespacedConfigMap({ name, namespace: ns }),
    (ns, body) => coreApi.createNamespacedConfigMap({ namespace: ns, body }),
    (name, ns, body) => coreApi.replaceNamespacedConfigMap({ name, namespace: ns, body }),
    resources.configMap
  );
  await createOrReplace(
    (name, ns) => appsApi.readNamespacedDeployment({ name, namespace: ns }),
    (ns, body) => appsApi.createNamespacedDeployment({ namespace: ns, body }),
    (name, ns, body) => appsApi.replaceNamespacedDeployment({ name, namespace: ns, body }),
    resources.deployment
  );
  await createOrReplace(
    (name, ns) => coreApi.readNamespacedService({ name, namespace: ns }),
    (ns, body) => coreApi.createNamespacedService({ namespace: ns, body }),
    (name, ns, body) => coreApi.replaceNamespacedService({ name, namespace: ns, body }),
    resources.service
  );
  await createOrReplace(
    (name, ns) => networkingApi.readNamespacedIngress({ name, namespace: ns }),
    (ns, body) => networkingApi.createNamespacedIngress({ namespace: ns, body }),
    (name, ns, body) => networkingApi.replaceNamespacedIngress({ name, namespace: ns, body }),
    resources.ingress
  );

  console.log(
    `Created site ${resources.service.metadata.name} for ${site.spec.website_url} in namespace ${namespace}`
  );
}

function startWatch() {
  const path = `/apis/${GROUP}/${VERSION}/${PLURAL}`;

  watcher.watch(
    path,
    {},
    (type, site) => {
      if (type === "ADDED" || type === "MODIFIED") {
        reconcile(site).catch((error) => {
          console.error(`Failed to reconcile ${site.metadata?.name}:`, error.body || error);
        });
      }
    },
    (error) => {
      if (error) {
        console.error("DummySite watch stopped:", error.body || error);
      }
      setTimeout(startWatch, 5_000);
    }
  );
}

console.log("Starting DummySite controller");
startWatch();
