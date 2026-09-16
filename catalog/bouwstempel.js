const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content ?? '';

const when = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export function showBuildStamp() {
  const holder = document.querySelector('#bouwstempel');
  if (!holder) return;
  const built = meta('catalogus-gebouwd');
  const version = meta('catalogus-versie');
  const at = built ? new Date(built) : null;
  if (!at || Number.isNaN(at.getTime())) {
    holder.hidden = true;
    return;
  }
  holder.textContent = `built ${when.format(at)}`;
  holder.title = [`built ${built}`, version && `version ${version}`].filter(Boolean).join(' · ');
}

showBuildStamp();
