/** Tab opts into visible keyboard focus until the next mouse, pen or touch press.
 * Capture runs before menus/dialogs move focus or stop keyboard propagation. */
document.addEventListener('keydown',event=>{
 if(event.key==='Tab'&&!event.altKey&&!event.ctrlKey&&!event.metaKey)document.documentElement.dataset.keyboardFocus='true';
},true);
document.addEventListener('pointerdown',()=>{
 delete document.documentElement.dataset.keyboardFocus;
},true);
