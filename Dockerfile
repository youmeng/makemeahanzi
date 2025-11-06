FROM ubuntu:16.04

# Set noninteractive mode
ENV DEBIAN_FRONTEND=noninteractive

# Fix expired GPG keys and install required packages
RUN apt-get update && apt-get install -y \
    curl \
    python \
    build-essential \
    locales \
    git \
    ca-certificates \
    mongodb-clients && \
    update-ca-certificates

# Generate and activate UTF-8 locale
RUN locale-gen en_US.UTF-8
ENV LANG=en_US.UTF-8 \
    LANGUAGE=en_US:en \
    LC_ALL=en_US.UTF-8

# Disable strict TLS checks for legacy package downloads
ENV NODE_TLS_REJECT_UNAUTHORIZED=0

# Install Node 4.8.4 manually
RUN curl -sL https://deb.nodesource.com/setup_4.x | bash - && \
    apt-get install -y nodejs

# Install Meteor 1.4.1.1
RUN curl https://install.meteor.com/?release=1.4.1.1 | sh

# Pre-create /app with safe permissions (won't affect mounted volume)
RUN mkdir -p /app && chmod -R 755 /app

# Set working directory
WORKDIR /app

# Default command (can be overridden by docker-compose)
CMD ["meteor"]