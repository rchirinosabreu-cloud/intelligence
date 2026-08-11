const getBrowserOrigin = () => (typeof window !== 'undefined' ? window.location.origin : null);

export const resolvePlatformLink = (url, origin = getBrowserOrigin()) => {
  if (!url || !origin) return { kind: 'invalid' };

  try {
    const base = new URL(origin);
    const target = new URL(url, base);

    if (!['http:', 'https:'].includes(target.protocol)) {
      return { kind: 'invalid' };
    }

    if (target.origin === base.origin) {
      return {
        kind: 'internal',
        path: `${target.pathname}${target.search}${target.hash}`,
      };
    }

    return { kind: 'external', url: target.href };
  } catch {
    return { kind: 'invalid' };
  }
};

export const openPlatformLink = (url, options = {}) => {
  const {
    origin = getBrowserOrigin(),
    navigate,
    openExternal = typeof window !== 'undefined' ? window.open.bind(window) : null,
  } = options;
  const target = resolvePlatformLink(url, origin);

  if (target.kind === 'internal') {
    if (navigate) {
      navigate(target.path);
    } else if (typeof window !== 'undefined') {
      window.location.assign(target.path);
    }
    return 'internal';
  }

  if (target.kind === 'external' && openExternal) {
    openExternal(target.url, '_blank', 'noopener,noreferrer');
    return 'external';
  }

  return 'invalid';
};
