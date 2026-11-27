export function holdButton(button, change, {cancelOnExit = true, signal} = {}) {
  let heldPointer = null, heldKey = null;
  const listen = (target,type,callback)=>target.addEventListener(type,callback,{signal});
  function stop() {
    const pointer = heldPointer;
    heldPointer = heldKey = null;
    change(false);
    if (pointer !== null && button.hasPointerCapture(pointer)) button.releasePointerCapture(pointer);
  }
  listen(button,'pointerdown',event=>{
    if (event.button !== 0 || heldPointer !== null || heldKey !== null) return;
    event.preventDefault();
    heldPointer = event.pointerId;
    button.setPointerCapture(heldPointer);
    change(true);
  });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) {
    listen(button,type,event=>{if (event.pointerId === heldPointer) stop();});
  }
  if (cancelOnExit) {
    listen(button,'pointermove',event=>{
      if (event.pointerId !== heldPointer) return;
      const bounds = button.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) stop();
    });
  }
  for (const type of ['contextmenu','selectstart','dragstart']) {
    listen(button,type,event=>event.preventDefault());
  }
  listen(button,'keydown',event=>{
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (event.repeat || heldPointer !== null) return;
    heldKey = event.key;
    change(true);
  });
  listen(button,'keyup',event=>{
    if (event.key !== heldKey) return;
    event.preventDefault();
    stop();
  });
  listen(button,'blur',()=>{if (heldKey !== null) stop();});
  listen(window,'blur',stop);
  listen(window,'pagehide',stop);
  listen(document,'visibilitychange',()=>{if (document.hidden) stop();});
  signal?.addEventListener('abort',stop,{once:true});
  return stop;
}
