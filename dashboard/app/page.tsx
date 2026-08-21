'use client';

import Image from 'next/image';
import Link from 'next/link';

import { NotifyModalProvider, useNotifyModal } from '@/components/NotifyModal';
import { ScreenshotCarousel } from '@/components/ScreenshotCarousel';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

import styles from './marketing.module.css';

function NotifyButton({
  className,
  children,
  groomer,
  style,
}: {
  className: string;
  children: React.ReactNode;
  groomer?: boolean;
  style?: React.CSSProperties;
}) {
  const { openModal } = useNotifyModal();
  return (
    <button className={className} style={style} onClick={() => openModal({ groomer })}>
      {children}
    </button>
  );
}

export default function MarketingHomePage() {
  return (
    <NotifyModalProvider>
      <SiteHeader showAuthCta />

      <div className={styles.hero} id="top">
        <Image className={styles.heroPhoto} src="/images/hero-groomer.jpg" alt="A groomer carefully combing a small white dog on a grooming table" fill priority />
        <div className={styles.heroScrim} />
        <div className={styles.wrap}>
          <div className={styles.heroInner}>
            <p className="eyebrow">Grooming, booked in a tap</p>
            <h1>The easiest way to book &mdash; and run &mdash; pet grooming.</h1>
            <p className={styles.lede}>
              Pet owners book, reschedule, and pay for grooming in seconds. Groomers get one calm place to manage
              their whole day. No phone tag, no paper calendar.
            </p>
            <div className={styles.ctaRow}>
              <NotifyButton className={`btn ${styles.btnSage}`}>Get notified at launch</NotifyButton>
              <a className={`btn ${styles.btnGhostDark}`} href="#groomers">
                I&rsquo;m a groomer &rarr;
              </a>
            </div>
            <p className={styles.avail}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="7" y="2" width="10" height="20" rx="2" />
                <path d="M11 18h2" />
              </svg>
              Coming soon to iPhone and Android
            </p>
          </div>
        </div>
      </div>

      <section id="owners" className={styles.section}>
        <div className={styles.wrap}>
          <div className={styles.secHead}>
            <p className="eyebrow">For pet owners</p>
            <h2>Booking that respects your time.</h2>
            <p>Your groomer, your pet&rsquo;s schedule, your card on file &mdash; all in one place. Here&rsquo;s what that feels like.</p>
          </div>
          <div className={styles.grid3}>
            <div className={`card ${styles.featureCard}`}>
              <div className={styles.ic}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 6v6l4 2" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
              </div>
              <h3>Book in seconds</h3>
              <p>Pick a service, choose an open time, and you&rsquo;re done. No calling, no waiting for a callback.</p>
            </div>
            <div className={`card ${styles.featureCard}`}>
              <div className={styles.ic}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <path d="M2 10h20" />
                </svg>
              </div>
              <h3>Pay right in the app</h3>
              <p>Your card stays on file. When the cut&rsquo;s done, payment just happens &mdash; no cash, no chasing an invoice.</p>
            </div>
            <div className={`card ${styles.featureCard}`}>
              <div className={styles.ic}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 1 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
                </svg>
              </div>
              <h3>Never miss an appointment</h3>
              <p>A friendly reminder before every visit, so your pet&rsquo;s next groom never sneaks up on you.</p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} style={{ paddingTop: 0 }}>
        <div className={styles.wrap}>
          <div className={`${styles.secHead} ${styles.secHeadCenter}`}>
            <p className="eyebrow">See it in action</p>
            <h2>Find a groomer, check the details, book the visit.</h2>
          </div>
          <ScreenshotCarousel
            slides={[
              {
                src: '/images/screenshot-browse.png',
                alt: 'Browse tab showing nearby groomers',
                caption: 'Find a groomer near you',
              },
              {
                src: '/images/screenshot-groomer-detail.png',
                alt: 'Groomer detail page with services and reviews',
                caption: 'See services, reviews, and pricing',
              },
              {
                src: '/images/screenshot-bookings.png',
                alt: 'Bookings tab showing upcoming appointments',
                caption: 'Manage your appointments',
              },
              {
                src: '/images/screenshot-profile.png',
                alt: 'Profile screen showing pets Biscuit and Luna',
                caption: 'Set up your pets once',
              },
              {
                src: '/images/screenshot-customer-chat.png',
                alt: 'Chat with the AI booking assistant to schedule an appointment',
                caption: 'Book through a quick chat',
              },
            ]}
          />
        </div>
      </section>

      <div className={styles.band} id="groomers">
        <div className={`${styles.wrap} ${styles.bandInner}`}>
          <div className={styles.bandGrid}>
            <div>
              <p className={`eyebrow ${styles.eyebrowClay}`}>For groomers</p>
              <h2>Run your grooming business, not your front desk.</h2>
              <p className={styles.pitch}>
                Take bookings, collect payment automatically, and keep clients coming back &mdash; without the paper
                calendar and the missed calls. Start free, and upgrade to Pro when you&rsquo;re ready to grow.
              </p>
              <div className={styles.ctaRow}>
                <NotifyButton className="btn btn-secondary" groomer>
                  List your business
                </NotifyButton>
                <a className={`btn ${styles.btnGhostBand}`} href="#how">
                  See how it works
                </a>
              </div>
              <p className={styles.upgradeExisting}>
                Already on PawBooker? <Link href="/upgrade">Upgrade to Pro &rarr;</Link>
              </p>
            </div>
            <div className={styles.priceCard}>
              <div className={styles.tier}>PawBooker Pro</div>
              <div className={styles.price}>
                <span className={styles.amt}>$35</span>
                <span className={styles.per}>/ month</span>
              </div>
              <p className={styles.priceDesc}>Everything in Free, plus the tools that pay for themselves.</p>
              <ul className={styles.feat}>
                <li>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                  Keep 100% of every booking &mdash; no per-client fee
                </li>
                <li>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                  Automatic win-back reminders for lapsed clients
                </li>
                <li>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                  Business insights on revenue and repeat visits
                </li>
                <li>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                  Your own AI assistant for the day-to-day
                </li>
              </ul>
              <NotifyButton className="btn btn-secondary" groomer style={{ width: '100%', display: 'flex' }}>
                List your business
              </NotifyButton>
              <p className={styles.freeNote}>Start free &mdash; no contract, cancel anytime.</p>
            </div>
          </div>
        </div>
      </div>

      <section className={styles.section}>
        <div className={styles.wrap}>
          <div className={`${styles.secHead} ${styles.secHeadCenter}`}>
            <p className="eyebrow">See it in action</p>
            <h2>Your day, at a glance.</h2>
          </div>
          <ScreenshotCarousel
            slides={[
              {
                src: '/images/screenshot-groomer-setup.png',
                alt: 'Business info screen for setting up a salon profile',
                caption: 'Set up your salon in minutes',
              },
              {
                src: '/images/screenshot-groomer-staff.png',
                alt: 'Groomers list showing salon staff',
                caption: 'Add your groomers',
              },
              {
                src: '/images/screenshot-groomer-hours.png',
                alt: 'Weekly hours screen for setting availability',
                caption: 'Set your hours',
              },
              {
                src: '/images/screenshot-groomer-dashboard.png',
                alt: 'Groomer dashboard showing booking requests to accept or decline',
                caption: 'Accept requests and manage your day',
              },
              {
                src: '/images/screenshot-groomer-insights.png',
                alt: 'Business insights showing revenue, repeat customers, and tips',
                caption: 'Track revenue and repeat customers',
              },
              {
                src: '/images/screenshot-groomer-chat.png',
                alt: 'AI business assistant answering questions about revenue and pending requests',
                caption: 'Ask your AI assistant anything',
              },
            ]}
          />
        </div>
      </section>

      <section id="how" className={styles.section}>
        <div className={styles.wrap}>
          <div className={styles.secHead}>
            <p className="eyebrow">How it works</p>
            <h2>From &ldquo;my dog needs a bath&rdquo; to booked.</h2>
          </div>
          <div className={styles.steps}>
            <div className={styles.step}>
              <div className={styles.num}>1</div>
              <h3>Find your groomer</h3>
              <p>Search groomers nearby, or enter your groomer&rsquo;s invite code to connect with them directly.</p>
            </div>
            <div className={styles.step}>
              <div className={styles.num}>2</div>
              <h3>Pick a time</h3>
              <p>Choose the service your pet needs and grab an open slot that works for your schedule.</p>
            </div>
            <div className={styles.step}>
              <div className={styles.num}>3</div>
              <h3>Show up relaxed</h3>
              <p>We&rsquo;ll remind you before the appointment and handle payment automatically. That&rsquo;s it.</p>
            </div>
          </div>
        </div>
      </section>

      <div className={styles.wrap}>
        <section className={styles.section} style={{ paddingTop: 0 }}>
          <div className={styles.notifyBand}>
            <h2>PawBooker is almost ready.</h2>
            <p>Leave your email and we&rsquo;ll let you know the moment it&rsquo;s available to download.</p>
            <NotifyButton className="btn btn-primary">Get notified at launch</NotifyButton>
          </div>
        </section>
      </div>

      <SiteFooter />
    </NotifyModalProvider>
  );
}
