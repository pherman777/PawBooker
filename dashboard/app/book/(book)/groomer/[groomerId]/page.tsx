'use client';

import { PawPrint } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/Button';
import { StarRating } from '@/components/StarRating';
import { useCustomerAuth } from '@/lib/customerAuth';
import { getOrCreateGroomerThread } from '@/lib/chat';
import { customerSupabase } from '@/lib/customerSupabase';
import { DAYS_OF_WEEK, dayLabel, formatDayHours, todayKey } from '@/lib/hours';
import { fetchGroomerProfile, type GroomerProfile, type SalonReview } from '@/lib/groomers';
import { formatPhoneForDisplay } from '@/lib/phone';

import styles from './page.module.css';

// Port of app/groomer/[id].tsx.
export default function GroomerProfilePage() {
  const { groomerId } = useParams<{ groomerId: string }>();
  const router = useRouter();
  const { session } = useCustomerAuth();

  const [groomer, setGroomer] = useState<GroomerProfile | null>(null);
  const [reviews, setReviews] = useState<SalonReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messaging, setMessaging] = useState(false);
  const [startingBookingFor, setStartingBookingFor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchGroomerProfile(groomerId)
      .then(({ groomer: g, reviews: r }) => {
        if (!cancelled) {
          setGroomer(g);
          setReviews(r);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Something went wrong');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groomerId]);

  async function handleMessage() {
    if (!session || !groomer) return;
    setMessaging(true);
    try {
      const threadId = await getOrCreateGroomerThread(session.user.id, groomer.id);
      router.push(`/book/messages/${threadId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start conversation');
    } finally {
      setMessaging(false);
    }
  }

  async function handleBookPress(serviceId: string) {
    if (!session || !groomer) return;
    setStartingBookingFor(serviceId);
    const { count, error: countError } = await customerSupabase.from('pets').select('id', { count: 'exact', head: true }).eq('owner_id', session.user.id);
    setStartingBookingFor(null);

    if (countError) {
      setError(countError.message);
      return;
    }
    if (!count) {
      router.push('/book/pets/new');
      return;
    }
    router.push(`/book/groomer/${groomer.id}/schedule?serviceId=${serviceId}`);
  }

  if (loading) {
    return (
      <div className="page-loading">
        <span className="spinner" aria-hidden />
      </div>
    );
  }

  if (error || !groomer) {
    return <p className="sign-in-error">Couldn&apos;t load this groomer{error ? `: ${error}` : ''}.</p>;
  }

  const hasCoords = groomer.latitude != null && groomer.longitude != null;

  return (
    <div>
      <div className={styles.headerRow}>
        <div className={styles.avatar}>
          {groomer.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={groomer.avatarUrl} alt="" />
          ) : (
            <PawPrint size={28} strokeWidth={2} />
          )}
        </div>
        <div>
          <h1 className={styles.name}>{groomer.name}</h1>
          <p className={styles.address}>{groomer.address}</p>
        </div>
      </div>

      {hasCoords && (
        <p style={{ marginTop: 10 }}>
          <a
            className="sign-in-footer-link"
            href={`https://www.google.com/maps/dir/?api=1&destination=${groomer.latitude},${groomer.longitude}`}
            target="_blank"
            rel="noopener noreferrer">
            Get directions
          </a>
        </p>
      )}

      <p className={styles.rating}>
        ★ {groomer.rating.toFixed(1)} ({groomer.reviewCount} reviews)
      </p>
      {groomer.bio && <p className={styles.bio}>{groomer.bio}</p>}

      {groomer.isDeactivated ? (
        <p className={styles.deactivatedNotice}>This salon is no longer accepting messages or bookings.</p>
      ) : (
        <Button label="Message this groomer" variant="secondary" onClick={handleMessage} loading={messaging} />
      )}

      <p className={styles.sectionTitle}>Services</p>
      {groomer.services.map((service) => (
        <div key={service.id} className={styles.serviceRow}>
          <div className={styles.serviceInfo}>
            <div className={styles.serviceName}>{service.name}</div>
            <div className={styles.serviceMeta}>{service.durationMinutes} min</div>
            {service.description && <div className={styles.serviceDescription}>{service.description}</div>}
          </div>
          <div className={styles.serviceAction}>
            <div className={styles.servicePrice}>${(service.priceCents / 100).toFixed(0)}</div>
            {!groomer.isDeactivated && (
              <Button label="Book" size="sm" onClick={() => handleBookPress(service.id)} loading={startingBookingFor === service.id} />
            )}
          </div>
        </div>
      ))}

      {groomer.hours && (
        <>
          <p className={styles.sectionTitle}>Hours</p>
          {DAYS_OF_WEEK.map((day) => (
            <div key={day} className={styles.hoursRow}>
              <span className={day === todayKey() ? styles.hoursToday : ''}>{dayLabel(day)}</span>
              <span className={day === todayKey() ? styles.hoursToday : ''}>{formatDayHours(groomer.hours![day])}</span>
            </div>
          ))}
        </>
      )}

      {(groomer.phone || groomer.email) && (
        <>
          <p className={styles.sectionTitle}>Contact</p>
          {groomer.phone && (
            <a className={styles.contactLink} href={`tel:${groomer.phone.replace(/[^\d+]/g, '')}`}>
              {formatPhoneForDisplay(groomer.phone)}
            </a>
          )}
          {groomer.email && (
            <a className={styles.contactLink} href={`mailto:${groomer.email}`}>
              {groomer.email}
            </a>
          )}
        </>
      )}

      <p className={styles.sectionTitle}>Reviews</p>
      {reviews.length === 0 && <p className="page-subtitle">No reviews yet.</p>}
      {reviews.map((review) => (
        <div key={review.id} className={styles.reviewRow}>
          <div className={styles.reviewHeader}>
            <StarRating value={review.rating} size={16} />
            <span className={styles.reviewDate}>{new Date(review.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
          </div>
          <div className={styles.reviewAuthor}>Verified customer</div>
          {review.comment && <p className={styles.reviewComment}>{review.comment}</p>}
        </div>
      ))}
    </div>
  );
}
