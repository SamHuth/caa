import './styles.css';
import { go } from './ui/app';

// Injected by something outside the app; styles.css hides it, and this removes it.
const removeBadge = () => document.getElementById('nl-badge-frame')?.remove();
removeBadge();
new MutationObserver(removeBadge).observe(document.documentElement, { childList: true, subtree: true });

const code = new URLSearchParams(location.search).get('code');
if (code) {
  history.replaceState(null, '', location.pathname);
  go.multiplayer(code);
} else {
  go.home();
}
