import './styles.css';
import { go } from './ui/app';

const code = new URLSearchParams(location.search).get('code');
if (code) {
  history.replaceState(null, '', location.pathname);
  go.multiplayer(code);
} else {
  go.home();
}
