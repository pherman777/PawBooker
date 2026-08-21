import Image from 'next/image';

import styles from './BrowserFrame.module.css';

export function BrowserFrame({
  src,
  alt,
  width,
  height,
  url = 'app.paw-booker.com',
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  url?: string;
}) {
  return (
    <div className={styles.frame}>
      <div className={styles.chrome}>
        <div className={styles.dots}>
          <span />
          <span />
          <span />
        </div>
        <div className={styles.urlBar}>{url}</div>
      </div>
      <Image src={src} alt={alt} width={width} height={height} className={styles.shot} />
    </div>
  );
}
