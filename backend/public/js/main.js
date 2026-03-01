// Main JavaScript
(function () {
    'use strict';

    // Smooth scrolling for anchor links
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                const href = this.getAttribute('href');
                if (href === '#') return;

                e.preventDefault();
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
    }

    // Animate elements on scroll
    function initScrollAnimations() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('fade-in');
                }
            });
        }, {
            threshold: 0.1
        });

        document.querySelectorAll('.feature-card, .stat-card').forEach(el => {
            observer.observe(el);
        });
    }

    // Header scroll effect
    function initHeaderScroll() {
        const header = document.querySelector('.header');
        if (!header) return;

        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                header.style.boxShadow = 'var(--shadow-md)';
            } else {
                header.style.boxShadow = 'none';
            }
        });
    }

    // Initialize on DOM load
    function init() {
        initSmoothScroll();
        initScrollAnimations();
        initHeaderScroll();

        console.log('ZEDLY Platform initialized ✓');
    }

    // Run on DOM load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
