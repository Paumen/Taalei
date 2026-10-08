const hashes = new Map(
  (document.querySelector('meta[name="catalogus-hashes"]')?.content ?? '')
    .split(' ').filter(Boolean).map((pair) => pair.split(':')),
);

export const withHash = (path, hash) => (hash ? `${path}?v=${hash}` : path);

export const stamped = (path) => withHash(path, hashes.get(path.slice(path.lastIndexOf('/') + 1)));
