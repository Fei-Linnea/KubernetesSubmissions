# Exercise 5.2: Istio ambient service mesh

This directory contains only new files for Exercise 5.2. Existing application, monitoring and DummySite files are intentionally unchanged.

The official Istio documentation used for this exercise is:

- [What is Istio](https://istio.io/latest/docs/overview/what-is-istio/)
- [Sidecar or ambient](https://istio.io/latest/docs/overview/dataplane-modes/)
- [Ambient overview](https://istio.io/latest/docs/ambient/overview/)
- [Ambient getting started](https://istio.io/latest/docs/ambient/getting-started/)
- [Bookinfo sample](https://istio.io/latest/docs/ambient/getting-started/deploy-sample-app/)
- [Secure and visualize](https://istio.io/latest/docs/ambient/getting-started/secure-and-visualize/)

## 1. Check the cluster

Run these commands in Git Bash. Istio 1.31 currently supports Kubernetes 1.32 through 1.36 according to the official getting-started guide.

```sh
kubectl config current-context
kubectl version
kubectl get nodes
kubectl get svc -n monitoring prom-prometheus-server
```

Use the cluster that you intend to submit for the exercise. The earlier context was a GKE cluster, while the exercise text describes k3d; the installation commands are not interchangeable.

## 2. Install the Istio CLI

From Git Bash, download the current Istio release and add its CLI to the current shell:

```sh
curl -L https://istio.io/downloadIstio | sh -
cd istio-1.31.0
export PATH="$PWD/bin:$PATH"
istioctl version
```

The command should show a client version. Before installation it is normal for the cluster version to report that Istio is not present.

## 3. Install Istio ambient mode

### k3d

For a new k3d cluster, the official prerequisites require Traefik to be disabled because it can conflict with Istio ingress gateways:

```sh
k3d cluster create --api-port 6550 -p '9080:80@loadbalancer' -p '9443:443@loadbalancer' --agents 2 --k3s-arg '--disable=traefik@server:*'
istioctl install --set profile=ambient --set values.global.platform=k3d --skip-confirmation
```

If the k3d cluster already exists with Traefik enabled, do not recreate it blindly. Follow the official k3d prerequisite page first.

### Existing GKE cluster

Do not set `global.platform=k3d` on GKE. Use the normal ambient profile and follow the GKE-specific prerequisites if installing with Helm:

```sh
istioctl install --set profile=ambient --skip-confirmation
```

Wait for the installation:

```sh
kubectl get pods -n istio-system
istioctl verify-install
```

## 4. Install Gateway API CRDs

The Bookinfo gateway uses the Kubernetes Gateway API. Install the CRDs once:

```sh
kubectl get crd gateways.gateway.networking.k8s.io >/dev/null 2>&1 || \
kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.0/experimental-install.yaml
```

## 5. Deploy the Bookinfo application

Use the same Istio release directory downloaded in step 2:

```sh
kubectl apply -f samples/bookinfo/platform/kube/bookinfo.yaml
kubectl apply -f samples/bookinfo/platform/kube/bookinfo-versions.yaml
kubectl get pods
```

Wait until the Bookinfo pods are ready. Then create the Gateway API route included in this directory:

```sh
kubectl apply -f dummy-site-controller/istio/bookinfo-gateway.yaml
kubectl annotate gateway bookinfo-gateway networking.istio.io/service-type=ClusterIP --namespace=default --overwrite
kubectl get gateway bookinfo-gateway
kubectl port-forward svc/bookinfo-gateway-istio 8080:80
```

Open `http://localhost:8080/productpage`. Refreshing the page should show different reviews versions over time.

## 6. Add Bookinfo to ambient mode

The included JSON patch labels the existing `default` namespace. It does not define or delete the namespace:

```sh
kubectl patch namespace default --type=merge --patch-file dummy-site-controller/istio/ambient-default-namespace-label.json
kubectl get namespace default --show-labels
kubectl get pods -n default
```

Ambient mode uses the per-node `ztunnel` proxy for L4 traffic and mTLS. Application pods do not receive sidecar containers and do not need to be restarted for this namespace label change.

## 7. Install Kiali and connect it to Prometheus

The Kiali Kustomization downloads the official Istio 1.29 addon and patches its ConfigMap to use the Prometheus service from the earlier monitoring setup:

```sh
kubectl apply -k dummy-site-controller/istio/kiali
kubectl rollout status deployment/kiali -n istio-system
kubectl port-forward svc/kiali 20001:20001 -n istio-system
```

Open `http://localhost:20001/kiali`. In Kiali, select the `default` namespace and open the Traffic Graph view.

Generate traffic in another Git Bash window while the port-forward remains running:

```sh
for i in $(seq 1 100); do curl -sSI -o /dev/null http://localhost:8080/productpage; done
```

The existing Prometheus service must be reachable at `prom-prometheus-server.monitoring.svc.cluster.local:80`. If that service has a different name, update only the new `kiali/kiali-config-patch.yaml` file before applying the Kiali Kustomization.

## 8. Verify metrics

```sh
kubectl get pods -n istio-system
kubectl get gateway,httproute -n default
kubectl get pods -n default
kubectl logs -n istio-system -l app=ztunnel --tail=20
```

The Kiali graph demonstrates traffic visibility. For direct Prometheus verification, port-forward the existing Prometheus service and query `istio_tcp_connections_opened_total` or inspect available `istio_` metrics:

```sh
kubectl port-forward svc/prom-prometheus-server 9090:80 -n monitoring
```

## 9. Cleanup

Stop active port-forwards with `Ctrl-C`, then remove only the resources created for this exercise:

```sh
kubectl delete -f dummy-site-controller/istio/bookinfo-gateway.yaml
kubectl label namespace default istio.io/dataplane-mode-
kubectl delete -k dummy-site-controller/istio/kiali
kubectl delete -f samples/bookinfo/platform/kube/bookinfo-versions.yaml
kubectl delete -f samples/bookinfo/platform/kube/bookinfo.yaml
istioctl uninstall --purge -y
kubectl delete namespace istio-system
```

Do not delete the existing `monitoring` namespace or its Prometheus installation. Delete the Gateway API CRDs only if this cluster does not use them for anything else.
