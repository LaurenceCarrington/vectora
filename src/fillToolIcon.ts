import type {FillPaint} from './fillPaint';

/** Keep the shared bucket icon unfilled; describe the active paint in its tooltip. */
export function renderFillToolIcon(button:HTMLButtonElement,paint:FillPaint,noFill=false):void {
 const label=paint.kind==='colour'?paint.colour:paint.kind==='gradient'?`${paint.type} gradient`:`${paint.type} pattern`;
 button.title=`Colour fill (B) · ${noFill?'No fill':`${label} · ${Math.round(paint.opacity*100)}% opacity`}`;
}
