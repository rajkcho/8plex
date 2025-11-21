import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

export function Navbar() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <nav className="navbar">
            <div className="navbar-container">
                <div className="navbar-logo">
                    <Link to="/">8plex</Link>
                </div>

                <div className="navbar-links desktop-only">
                    <Link to="/buy">Buy</Link>
                    <Link to="/sell">Sell</Link>
                    <Link to="/calculator">Calculator</Link>
                    <Link to="/resources">Resources</Link>
                </div>

                <div className="navbar-actions desktop-only">
                    <button className="btn-text">Sign In</button>
                    <button className="btn-primary">Get Started</button>
                </div>

                <button className="mobile-menu-btn" onClick={() => setIsOpen(!isOpen)}>
                    {isOpen ? <X /> : <Menu />}
                </button>
            </div>

            {isOpen && (
                <div className="mobile-menu">
                    <Link to="/buy" onClick={() => setIsOpen(false)}>Buy</Link>
                    <Link to="/sell" onClick={() => setIsOpen(false)}>Sell</Link>
                    <Link to="/calculator" onClick={() => setIsOpen(false)}>Calculator</Link>
                    <Link to="/resources" onClick={() => setIsOpen(false)}>Resources</Link>
                    <div className="mobile-actions">
                        <button className="btn-text">Sign In</button>
                        <button className="btn-primary">Get Started</button>
                    </div>
                </div>
            )}

            <style>{`
        .navbar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 64px;
          background: white;
          border-bottom: 1px solid var(--color-border);
          z-index: 1000;
        }

        .navbar-container {
          max-width: 1200px;
          margin: 0 auto;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 20px;
        }

        .navbar-logo a {
          font-weight: 700;
          font-size: 24px;
          color: var(--color-primary);
          text-decoration: none;
          letter-spacing: -0.03em;
        }

        .navbar-links {
          display: flex;
          gap: 32px;
        }

        .navbar-links a {
          text-decoration: none;
          color: var(--color-text);
          font-weight: 500;
          font-size: 15px;
          transition: color 0.2s;
        }

        .navbar-links a:hover {
          color: var(--color-primary);
        }

        .navbar-actions {
          display: flex;
          gap: 16px;
          align-items: center;
        }

        .btn-text {
          background: none;
          border: none;
          color: var(--color-text);
          font-weight: 600;
          font-size: 15px;
          padding: 8px 16px;
        }

        .btn-primary {
          background: var(--color-primary);
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 15px;
          transition: background 0.2s;
        }

        .btn-primary:hover {
          background: var(--color-primary-hover);
        }

        .mobile-menu-btn {
          display: none;
          background: none;
          border: none;
          padding: 4px;
        }

        .desktop-only {
          display: flex;
        }

        @media (max-width: 768px) {
          .desktop-only {
            display: none;
          }

          .mobile-menu-btn {
            display: block;
          }

          .mobile-menu {
            position: fixed;
            top: 64px;
            left: 0;
            right: 0;
            background: white;
            border-bottom: 1px solid var(--color-border);
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          .mobile-menu a {
            text-decoration: none;
            color: var(--color-text);
            font-weight: 500;
            font-size: 16px;
            padding: 8px 0;
          }

          .mobile-actions {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid var(--color-border);
          }
        }
      `}</style>
        </nav>
    );
}
