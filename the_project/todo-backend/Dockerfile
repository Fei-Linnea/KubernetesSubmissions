FROM node:22-alpine

WORKDIR /usr/src/app

COPY package.json .
RUN npm install

COPY index.js .

CMD ["node", "index.js"]