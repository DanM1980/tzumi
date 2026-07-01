import { useNavigate } from 'react-router-dom';
import styles from './LandingPage.module.css';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>✨ תזמורת AI ✨</h1>
        <p className={styles.subtitle}>הרפתקאות קסומות לילדים</p>

        <div className={styles.cards}>
          <button className={styles.kidCard} onClick={() => navigate('/kid')}>
            <span className={styles.emoji}>🧒</span>
            <span className={styles.label}>לילדה</span>
            <span className={styles.desc}>דברי עם חבר דמיוני!</span>
          </button>

          <button className={styles.adminCard} onClick={() => navigate('/admin')}>
            <span className={styles.emoji}>👩‍👧‍👦</span>
            <span className={styles.label}>להורה</span>
            <span className={styles.desc}>ניהול והתערבות בזמן אמת</span>
          </button>
        </div>
      </div>
    </div>
  );
}
