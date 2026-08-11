const VIEWPORT_MARGIN = 16;
const TRIGGER_GAP = 12;

export function getFloatingCardPosition(triggerRect, cardSize, viewportSize) {
  const viewportWidth = viewportSize.width;
  const viewportHeight = viewportSize.height;
  const cardWidth = cardSize.width;
  const cardHeight = cardSize.height;

  const centeredLeft = triggerRect.left + (triggerRect.width / 2) - (cardWidth / 2);
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - cardWidth - VIEWPORT_MARGIN);
  const left = Math.min(Math.max(centeredLeft, VIEWPORT_MARGIN), maxLeft);

  const topPosition = triggerRect.top - TRIGGER_GAP - cardHeight;
  const hasRoomAbove = topPosition >= VIEWPORT_MARGIN;
  const placement = hasRoomAbove ? 'top' : 'bottom';
  const desiredTop = hasRoomAbove ? topPosition : triggerRect.bottom + TRIGGER_GAP;
  const maxTop = Math.max(VIEWPORT_MARGIN, viewportHeight - cardHeight - VIEWPORT_MARGIN);
  const top = Math.min(Math.max(desiredTop, VIEWPORT_MARGIN), maxTop);

  return { left, top, placement };
}
