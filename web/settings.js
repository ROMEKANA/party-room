import {el} from './board.js';

export function setting(title,key,options,selected,editable,send) {
  const label = el('label','setting-row',title);
  const select = el('select');
  for (const [index,[value,caption]] of options.entries()) {
    const option = el('option','',caption);
    option.value = String(index);
    option.selected = value === selected;
    select.append(option);
  }
  select.disabled = !editable;
  select.onchange = async () => {
    const value = options[select.selectedIndex][0];
    select.disabled = true;
    if (!(await send('settings',{settings:{[key]:value}})) && select.isConnected) {
      select.selectedIndex = options.findIndex(option => option[0] === selected);
      select.disabled = !editable;
    }
  };
  label.append(select);
  return label;
}
