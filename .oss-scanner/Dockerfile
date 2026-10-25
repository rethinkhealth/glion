# Build image for Anthropic's OSS Scanner (https://github.com/anthropics/oss-scanner).
# The scanner builds this with the repository as the build context, then runs it without network access, so
# everything the build and the tests need is installed here.
FROM oven/bun:1 AS bun
FROM denoland/deno:bin AS deno

FROM node:24-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    HUSKY=0 \
    TURBO_TELEMETRY_DISABLED=1 \
    DO_NOT_TRACK=1 \
    CI=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates git python3 \
    && rm -rf /var/lib/apt/lists/*

# Bun and Deno run the MLLP integration suite (`pnpm test:integration:bun`, `pnpm test:integration:deno`).
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY --from=deno /deno /usr/local/bin/deno

COPY --chown=node:node . /src
WORKDIR /src

RUN npm install --global "$(node -p "require('./package.json').packageManager")"

# As root, file permissions do not apply, and the tests that check an unreadable file fail.
USER node

RUN pnpm install --frozen-lockfile

RUN pnpm build

# Run the unit tests so the image is known to work, without letting a failing test abort the build.
RUN pnpm test --continue || echo "WARNING: pnpm test reported failures"

CMD ["bash"]
