import { Search, ArrowRight, Home, DollarSign, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

export function HomePage() {
    return (
        <div className="homepage">
            {/* Hero Section */}
            <section className="hero">
                <div className="hero-content">
                    <h1>The new way to buy and sell homes</h1>
                    <p>We make it easy to find your dream home or sell your current one.</p>

                    <div className="search-container">
                        <div className="search-box">
                            <Search className="search-icon" />
                            <input
                                type="text"
                                placeholder="Enter an address, neighborhood, city, or ZIP code"
                                className="search-input"
                            />
                            <button className="search-button">
                                <ArrowRight />
                            </button>
                        </div>
                    </div>
                </div>
                <div className="hero-image">
                    <img
                        src="https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2"
                        alt="Modern home exterior"
                    />
                </div>
            </section>

            {/* Value Props */}
            <section className="value-props">
                <div className="container">
                    <h2>Everything you need to move forward</h2>
                    <div className="props-grid">
                        <div className="prop-card">
                            <div className="icon-circle">
                                <Home />
                            </div>
                            <h3>Buy a home</h3>
                            <p>Find your place with an immersive photo experience and the most listings, including things you won't find anywhere else.</p>
                            <button className="btn-outline">Search homes</button>
                        </div>
                        <div className="prop-card">
                            <div className="icon-circle">
                                <DollarSign />
                            </div>
                            <h3>Sell a home</h3>
                            <p>No matter what path you take to sell your home, we can help you navigate a successful sale.</p>
                            <button className="btn-outline">See your options</button>
                        </div>
                        <div className="prop-card">
                            <div className="icon-circle">
                                <TrendingUp />
                            </div>
                            <h3>Finance a home</h3>
                            <p>We can help you navigate the lending process and get you into your new home.</p>
                            <Link to="/calculator" className="btn-outline">Use Calculator</Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Stats Section */}
            <section className="stats-section">
                <div className="container">
                    <div className="stats-grid">
                        <div className="stat-item">
                            <span className="stat-number">450K+</span>
                            <span className="stat-label">Customers served</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-number">3,500+</span>
                            <span className="stat-label">Neighborhoods</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-number">$10B+</span>
                            <span className="stat-label">Home value transacted</span>
                        </div>
                    </div>
                </div>
            </section>

            <style>{`
        .homepage {
          width: 100%;
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 20px;
        }

        /* Hero Styles */
        .hero {
          position: relative;
          height: 600px;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #000;
          color: white;
          overflow: hidden;
        }

        .hero-image {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 1;
        }

        .hero-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0.6;
        }

        .hero-content {
          position: relative;
          z-index: 2;
          text-align: center;
          max-width: 800px;
          padding: 0 20px;
        }

        .hero h1 {
          font-size: 48px;
          font-weight: 700;
          margin-bottom: 16px;
          color: white;
          letter-spacing: -0.03em;
        }

        .hero p {
          font-size: 20px;
          margin-bottom: 40px;
          opacity: 0.9;
        }

        .search-container {
          max-width: 600px;
          margin: 0 auto;
        }

        .search-box {
          background: white;
          border-radius: 8px;
          padding: 8px;
          display: flex;
          align-items: center;
          box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        }

        .search-icon {
          color: var(--color-text-light);
          margin-left: 12px;
          width: 20px;
          height: 20px;
        }

        .search-input {
          flex: 1;
          border: none;
          padding: 12px 16px;
          font-size: 16px;
          outline: none;
          color: var(--color-text);
        }

        .search-button {
          background: var(--color-primary);
          color: white;
          border: none;
          width: 40px;
          height: 40px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }

        .search-button:hover {
          background: var(--color-primary-hover);
        }

        /* Value Props Styles */
        .value-props {
          padding: 80px 0;
          background: white;
        }

        .value-props h2 {
          text-align: center;
          font-size: 32px;
          margin-bottom: 64px;
        }

        .props-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 40px;
        }

        .prop-card {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }

        .icon-circle {
          width: 48px;
          height: 48px;
          background: #eef2ff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-primary);
          margin-bottom: 24px;
        }

        .prop-card h3 {
          font-size: 24px;
          margin-bottom: 12px;
        }

        .prop-card p {
          color: var(--color-text-light);
          margin-bottom: 24px;
          line-height: 1.6;
        }

        .btn-outline {
          padding: 10px 20px;
          border: 1px solid var(--color-primary);
          color: var(--color-primary);
          background: white;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          text-decoration: none;
          display: inline-block;
        }

        .btn-outline:hover {
          background: #eef2ff;
        }

        /* Stats Styles */
        .stats-section {
          padding: 64px 0;
          background: var(--color-bg-alt);
          border-top: 1px solid var(--color-border);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 40px;
          text-align: center;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
        }

        .stat-number {
          font-size: 40px;
          font-weight: 700;
          color: var(--color-primary);
          margin-bottom: 8px;
        }

        .stat-label {
          color: var(--color-text-light);
          font-size: 16px;
          font-weight: 500;
        }

        @media (max-width: 768px) {
          .hero h1 {
            font-size: 32px;
          }
          
          .props-grid {
            grid-template-columns: 1fr;
          }

          .stats-grid {
            grid-template-columns: 1fr;
            gap: 32px;
          }
        }
      `}</style>
        </div>
    );
}
