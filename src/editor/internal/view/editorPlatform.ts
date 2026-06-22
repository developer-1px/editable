import type { EditorPlatform } from "../model/platformModifier";

export function detectEditorPlatform(): EditorPlatform {
  const navigatorLike = globalThis.navigator as
    | (Navigator & { userAgentData?: { platform?: string } })
    | undefined;
  const navigatorPlatform =
    navigatorLike?.userAgentData?.platform ?? navigatorLike?.platform ?? "";
  const userAgent = navigatorLike?.userAgent ?? "";
  if (
    /mac|darwin|iphone|ipad|ipod/i.test(navigatorPlatform) ||
    /mac|darwin|iphone|ipad|ipod/i.test(userAgent)
  ) {
    return "mac";
  }

  return "other";
}
