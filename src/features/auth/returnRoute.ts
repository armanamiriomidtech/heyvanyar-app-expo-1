import type { PostLoginRoute } from '@/store/authStore';

export interface LoginReturnParams extends Record<string, string | undefined> {
  returnTo?: string;
  adShortLink?: string;
  pvId?: string;
}

export function getLoginReturnParams(params: LoginReturnParams): LoginReturnParams | undefined {
  if (params.returnTo === 'ads' || params.returnTo === 'ad-stage-three') {
    return { returnTo: params.returnTo };
  }
  if (params.returnTo === 'ad-report' && params.adShortLink) {
    return { returnTo: 'ad-report', adShortLink: params.adShortLink };
  }
  if (params.returnTo === 'ad-bookmark' && params.adShortLink) {
    return { returnTo: 'ad-bookmark', adShortLink: params.adShortLink };
  }
  if (params.returnTo === 'bookmarks') return { returnTo: 'bookmarks' };
  if (params.returnTo === 'chat-list') return { returnTo: 'chat-list' };
  if (params.returnTo === 'chat' && params.adShortLink) {
    return { returnTo: 'chat', adShortLink: params.adShortLink };
  }
  if (params.returnTo === 'chat-thread' && params.pvId && params.adShortLink) {
    return {
      returnTo: 'chat-thread',
      pvId: params.pvId,
      adShortLink: params.adShortLink,
    };
  }
  return undefined;
}

export function getPostLoginRoute(params: LoginReturnParams): PostLoginRoute | undefined {
  const returnParams = getLoginReturnParams(params);
  if (!returnParams) return undefined;

  if (returnParams.returnTo === 'ads') return '/(tabs)/ads';
  if (returnParams.returnTo === 'ad-stage-three') return '/ad-stage-three';
  if (returnParams.returnTo === 'ad-report' && returnParams.adShortLink) {
    return {
      pathname: '/ad/report/[shortLink]',
      params: { shortLink: returnParams.adShortLink },
    };
  }
  if (returnParams.returnTo === 'ad-bookmark' && returnParams.adShortLink) {
    return {
      pathname: '/ad/[shortLink]',
      params: { shortLink: returnParams.adShortLink },
    };
  }
  if (returnParams.returnTo === 'bookmarks') return '/(tabs)/bookmarks';
  if (returnParams.returnTo === 'chat-list') return '/(tabs)/chat';
  if (returnParams.returnTo === 'chat' && returnParams.adShortLink) {
    return {
      pathname: '/chat/new/[shortLink]',
      params: { shortLink: returnParams.adShortLink },
    };
  }
  if (
    returnParams.returnTo === 'chat-thread' &&
    returnParams.pvId &&
    returnParams.adShortLink
  ) {
    return {
      pathname: '/chat/[pvId]',
      params: {
        pvId: returnParams.pvId,
        adShortLink: returnParams.adShortLink,
      },
    };
  }
  return undefined;
}

export function isPostLoginRouteActive(
  currentPath: string,
  route: PostLoginRoute,
): boolean {
  const routePath = typeof route === 'string' ? route : route.pathname;
  const resolvedPath =
    typeof route === 'string'
      ? routePath
      : Object.entries(route.params).reduce<string>(
          (path, [key, value]) => path.replace(`[${key}]`, encodeURIComponent(value)),
          routePath,
        );
  const normalizePath = (path: string) =>
    `/${path
      .split('/')
      .filter((segment) => segment && !segment.startsWith('('))
      .join('/')}`;

  return normalizePath(currentPath) === normalizePath(resolvedPath);
}
