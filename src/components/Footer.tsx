import { Link } from 'react-router-dom';

export function Footer() {
    return (
        <footer className="footer">
            <div className="footer-container">
                <div className="footer-grid">
                    <div className="footer-col">
                        <h3>8plex</h3>
                        <p>Reinventing real estate investment analysis.</p>
                    </div>
                    <div className="footer-col">
                        <h4>Company</h4>
                        <Link to="/about">About</Link>
                        <Link to="/careers">Careers</Link>
                        <Link to="/press">Press</Link>
                    </div>
                    <div className="footer-col">
                        <h4>Resources</h4>
                        <Link to="/blog">Blog</Link>
                        <Link to="/guides">Guides</Link>
                        <Link to="/help">Help Center</Link>
                    </div>
                    <div className="footer-col">
                        <h4>Legal</h4>
                        <Link to="/terms">Terms</Link>
                        <Link to="/privacy">Privacy</Link>
                        <Link to="/licenses">Licenses</Link>
                    </div>
                </div>
                <div className="footer-bottom">
                    <p>&copy; {new Date().getFullYear()} 8plex. All rights reserved.</p>
                </div>
            </div>

            <style>{`
        .footer {
          background: #f9f9fb;
          padding: 64px 0 32px;
          border-top: 1px solid var(--color-border);
          margin-top: auto;
        }

        .footer-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 20px;
        }

        .footer-grid {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr;
          gap: 40px;
          margin-bottom: 48px;
        }

        .footer-col h3 {
          color: var(--color-primary);
          font-size: 24px;
          margin-bottom: 16px;
        }

        .footer-col h4 {
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--color-text-light);
          margin-bottom: 16px;
        }

        .footer-col p {
          color: var(--color-text-light);
          line-height: 1.6;
        }

        .footer-col a {
          display: block;
          color: var(--color-text);
          text-decoration: none;
          margin-bottom: 12px;
          font-size: 15px;
        }

        .footer-col a:hover {
          color: var(--color-primary);
          text-decoration: underline;
        }

        .footer-bottom {
          padding-top: 32px;
          border-top: 1px solid #e6e6e6;
          text-align: center;
          color: var(--color-text-light);
          font-size: 14px;
        }

        @media (max-width: 768px) {
          .footer-grid {
            grid-template-columns: 1fr;
            gap: 32px;
          }
        }
      `}</style>
        </footer>
    );
}
