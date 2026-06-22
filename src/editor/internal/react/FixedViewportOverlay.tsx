import { type ReactNode, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

type FixedViewportOverlayProps = {
  children: ReactNode;
  className: string;
};

export function FixedViewportOverlay({
  children,
  className,
}: FixedViewportOverlayProps) {
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const overlay = (
    <div aria-hidden={true} className={className}>
      {children}
    </div>
  );

  useLayoutEffect(() => {
    setPortalHost(document.body);
  }, []);

  if (portalHost === null) {
    return overlay;
  }

  return createPortal(overlay, portalHost);
}
