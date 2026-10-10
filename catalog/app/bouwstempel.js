import { meta } from './shared.js?v=06861d7ddb';

const two = (n) => String(n).padStart(2, '0');

const when = (at) =>
  `${two(at.getDate())}/${two(at.getMonth() + 1)} ${two(at.getHours())}:${two(at.getMinutes())}`;

function showBuildStamp() {
  const holder = document.querySelector('#bouwstempel');
  if (!holder) return;
  const built = meta('catalogus-gebouwd');
  const version = meta('catalogus-versie');
  const at = built ? new Date(built) : null;
  if (!at || Number.isNaN(at.getTime())) {
    holder.hidden = true;
    return;
  }
  holder.textContent = `built ${when(at)}`;
  holder.title = [`built ${built}`, version && `version ${version}`].filter(Boolean).join(' · ');
}

showBuildStamp();
