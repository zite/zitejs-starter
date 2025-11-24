FROM node:22-alpine AS base
WORKDIR /app

FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json package-lock.json /temp/dev/
RUN cd /temp/dev && npm ci

FROM base AS dev

COPY --from=install /temp/dev/node_modules ./node_modules

COPY . .

EXPOSE 8080/tcp

CMD ["npm", "run", "dev"]
