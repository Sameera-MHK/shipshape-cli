import Header from './components/Header';
import Footer from './components/Footer';
import { formatDate } from './utils/date';

const apiUrl = import.meta.env.VITE_API_URL;
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;

export default function App() {
  return (
    <>
      <Header />
      <p>{formatDate(new Date())} {apiUrl} {sentryDsn}</p>
      <Footer />
    </>
  );
}
