import { useState, type FormEvent } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { api } from '../api';
export function ContactPage() {
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setStatus('');
    try {
      await api('/contact', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
      });
      setSent(true);
      console.log('[sendMessage] Message received');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not send your message.');
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="section-wrap page-section">
      <p className="eyebrow">ALWAYS ON YOUR SIDE</p>
      <h1>Let’s talk.</h1>
      <div className="contact-layout">
        <div>
          <p className="page-intro">
            A question about your jersey?
            <br />A little help with an order?
            <br />
            We’re here for you.
          </p>
          <div id="shipping" className="contact-faq">
            <h2>A few good answers.</h2>
            <details open>
              <summary>How does shipping work?</summary>
              <p>
                Shipping is $10 per order and free for orders of $150 or more. Ask us about delivery
                availability and timing for your location.
              </p>
            </details>
            <details>
              <summary>Can I return a jersey?</summary>
              <p>
                Send your order reference and the reason for your return using this form. Our team
                will help arrange the next steps.
              </p>
            </details>
            <details>
              <summary>How do I pay?</summary>
              <p>
                This store currently accepts cash on delivery. We never ask for card details at
                checkout.
              </p>
            </details>
          </div>
        </div>
        {sent ? (
          <div className="contact-success">
            <Check size={40} />
            <h2>You’re heard.</h2>
            <p>Your message is saved with the store team.</p>
            <button className="button" onClick={() => setSent(false)}>
              Send another message
            </button>
          </div>
        ) : (
          <form className="contact-form" onSubmit={sendMessage}>
            <label>
              Your name
              <input name="name" autoComplete="name" required maxLength={300} />
            </label>
            <label>
              Email address
              <input type="email" name="email" autoComplete="email" required maxLength={254} />
            </label>
            <label>
              What’s on your mind?
              <textarea
                name="message"
                rows={6}
                required
                minLength={10}
                maxLength={5000}
                placeholder="Include your order reference if you have one."
              />
            </label>
            {status && (
              <p className="error-message" role="alert">
                {status}
              </p>
            )}
            <button className="button" disabled={pending}>
              {pending ? 'Sending…' : 'Send message'}
              <ArrowRight size={18} />
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
