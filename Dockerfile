# Copyright (c) Microsoft Corporation and others. Licensed under the MIT license.
# SPDX-License-Identifier: MIT

# FROM node:8-alpine
FROM docker-hub-remote.bahnhub.tech.rz.db.de/node:20
ENV APPDIR=/opt/service
# RUN apk update && apk upgrade && \
#    apk add --no-cache bash git openssh

## get SSH server running
# RUN apt-get update \
#     && apt-get install -y --no-install-recommends openssh-server \
#     && echo "root:Docker!" | chpasswd
# COPY sshd_config /etc/ssh/
# COPY init_container.sh /bin/
# RUN chmod 755 /bin/init_container.sh
# CMD ["/bin/init_container.sh"]

# Set environment variables from build arguments
ARG APP_VERSION="UNKNOWN"
ENV APP_VERSION=$APP_VERSION
ARG BUILD_SHA="UNKNOWN"
ENV BUILD_SHA=$BUILD_SHA

COPY patches /tmp/patches
COPY .npmrc package*.json /tmp/
COPY deps /tmp/deps
RUN cd /tmp && npm install --production
RUN mkdir -p "${APPDIR}" && cp -a /tmp/node_modules "${APPDIR}"

WORKDIR "${APPDIR}"
COPY . "${APPDIR}"

ENV PORT=4000
EXPOSE 4000 2222
ENTRYPOINT ["npm", "start"]
