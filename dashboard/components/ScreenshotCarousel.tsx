'use client';

import Image from 'next/image';
import { useState } from 'react';

import styles from './ScreenshotCarousel.module.css';

type Slide = { src: string; alt: string; caption: string };

export function ScreenshotCarousel({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);
  const slide = slides[index];

  function prev() {
    setIndex((i) => (i - 1 + slides.length) % slides.length);
  }
  function next() {
    setIndex((i) => (i + 1) % slides.length);
  }

  return (
    <div className={styles.carouselWrap}>
      <div className={styles.carousel}>
        <button type="button" className={styles.arrow} onClick={prev} aria-label="Previous screenshot">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div className={styles.shot}>
          <Image src={slide.src} alt={slide.alt} width={277} height={600} priority={index === 0} />
          <p>{slide.caption}</p>
        </div>

        <button type="button" className={styles.arrow} onClick={next} aria-label="Next screenshot">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className={styles.dots}>
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            className={`${styles.dot} ${i === index ? styles.dotActive : ''}`}
            onClick={() => setIndex(i)}
            aria-label={`Go to screenshot ${i + 1} of ${slides.length}`}
            aria-current={i === index}
          />
        ))}
      </div>
    </div>
  );
}
