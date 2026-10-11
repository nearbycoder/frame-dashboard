// Coordinate calculations use the rendered row bounds, including kiosk scaling.
export function moveLightGesture(gesture, x, y) {
  var dx = x - gesture.x, dy = y - gesture.y;
  if (!gesture.slide && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) gesture.cancel = true;
  if (gesture.cancel) return;
  if (!gesture.slide && Math.abs(dx) > 8) gesture.slide = true;
  if (gesture.slide) gesture.value = Math.max(0, Math.min(100, Math.round((x - gesture.left) / gesture.width * 100)));
}
