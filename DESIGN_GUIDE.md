# ZEDLY Design Guide

This guide explains how to apply the ZEDLY design system to new pages and components.

## Design System Overview

The ZEDLY platform uses a modern dark theme with consistent styling across all pages. The design is based on the landing page in the `landing-page` directory and has been applied to the entire project.

## Key Design Elements

### 1. Color Palette

All colors are defined as CSS custom properties in `/backend/public/css/main.css`:

```css
--primary: #1b3b6f;           /* Primary blue */
--primary-dark: #142a52;      /* Darker blue */
--accent: #2b59c3;            /* Accent blue */
--secondary: #10B981;         /* Green accent */
--success: #10B981;           /* Success green */
--warning: #F59E0B;           /* Warning orange */
--error: #EF4444;             /* Error red */
```

### 2. Background System

```css
--bg-main: #0A0E1A;           /* Main dark background */
--bg-primary: #0A0E1A;        /* Primary background */
--bg-secondary: #151B2D;      /* Secondary background */
--bg-card: #151B2D;           /* Card background */
```

The body background uses radial gradients:
```css
background: radial-gradient(circle at 20% 20%, rgba(43, 89, 195, 0.25), transparent 40%),
            radial-gradient(circle at 80% 10%, rgba(16, 185, 129, 0.2), transparent 35%),
            var(--bg-main);
```

### 3. Typography

```css
--font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

Font sizes are responsive using `clamp()`:
```css
h1 { font-size: clamp(2.2rem, 3vw, 3.4rem); }
```

### 4. Spacing System

```css
--spacing-xs: 0.25rem;   /* 4px */
--spacing-sm: 0.5rem;    /* 8px */
--spacing-md: 1rem;      /* 16px */
--spacing-lg: 1.5rem;    /* 24px */
--spacing-xl: 2rem;      /* 32px */
--spacing-2xl: 3rem;     /* 48px */
--spacing-3xl: 4rem;     /* 64px */
```

### 5. Border Radius

```css
--radius-sm: 0.5rem;     /* 8px */
--radius-md: 0.75rem;    /* 12px */
--radius-lg: 1rem;       /* 16px */
--radius-xl: 1.5rem;     /* 24px */
--radius-full: 9999px;   /* Full round */
```

## Component Patterns

### Navigation Bar

For landing pages, use the `.landing-nav` class:

```html
<header class="landing-nav">
    <div class="landing-brand">
        <div class="landing-logo">Z</div>
        <span>ZEDLY</span>
    </div>
    <nav class="landing-actions">
        <a class="landing-link" href="/login">Вход</a>
        <a class="landing-btn" href="/login">Зарегистрироваться</a>
        <span class="landing-separator">|</span>
        <button class="landing-lang-btn" id="landingLangBtn">RU</button>
    </nav>
</header>
```

Features:
- Sticky positioning
- Backdrop blur effect
- Transparent background with slight opacity

### Buttons

Primary button with gradient:
```html
<a class="landing-btn landing-btn-primary" href="#">Button Text</a>
```

Outline button:
```html
<a class="landing-btn landing-btn-outline" href="#">Button Text</a>
```

### Cards

Standard card with glassmorphism:
```html
<div class="landing-card">
    <i class="fas fa-icon"></i>
    <h3>Card Title</h3>
    <p>Card description text...</p>
</div>
```

Features:
- Background: `var(--bg-card)`
- Border: `1px solid rgba(255, 255, 255, 0.08)`
- Box shadow for depth
- Backdrop blur effect
- Hover animation (translateY)

### Hero Section

```html
<section class="landing-hero">
    <div class="landing-hero-content">
        <span class="landing-pill">Badge text</span>
        <h1>Hero Title</h1>
        <p>
            <span>Description line 1</span>
            <span>Description line 2</span>
        </p>
        <div class="landing-cta">
            <a class="landing-btn landing-btn-primary" href="#">Primary Action</a>
            <a class="landing-btn landing-btn-outline" href="#">Secondary Action</a>
        </div>
    </div>
    <div class="landing-hero-card">
        <!-- Metrics or features -->
    </div>
</section>
```

### Grid Layout

For feature cards:
```html
<div class="landing-grid">
    <article class="landing-card">...</article>
    <article class="landing-card">...</article>
    <article class="landing-card">...</article>
</div>
```

CSS:
```css
.landing-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 20px;
}
```

## Creating a New Page

### 1. HTML Structure

```html
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Page Title - ZEDLY</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <link rel="stylesheet" href="/css/main.css">
    <link rel="stylesheet" href="/css/your-page.css">
</head>
<body class="landing-page">
    <!-- Your content here -->
</body>
</html>
```

### 2. Apply the Background

Add `class="landing-page"` to the `<body>` tag to get the gradient background:

```css
.landing-page {
    background: radial-gradient(circle at 20% 20%, rgba(43, 89, 195, 0.25), transparent 40%),
                radial-gradient(circle at 80% 10%, rgba(16, 185, 129, 0.2), transparent 35%),
                var(--bg-main);
    color: var(--text-primary);
    min-height: 100vh;
}
```

### 3. Use Consistent Spacing

Always use spacing variables:
```css
padding: var(--spacing-lg);
margin-bottom: var(--spacing-xl);
gap: var(--spacing-md);
```

### 4. Add Transitions

For interactive elements:
```css
transition: transform 0.2s ease, box-shadow 0.2s ease;
```

On hover:
```css
:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
}
```

## Language Support

All pages support Russian (RU) and Uzbek (UZ) languages using the `data-i18n` attribute:

```html
<h1 data-i18n="heroTitle">Обучение, которое растёт вместе с вами</h1>
```

JavaScript translation object:
```javascript
const translations = {
    ru: {
        heroTitle: 'Обучение, которое растёт вместе с вами'
    },
    uz: {
        heroTitle: 'Ta\'lim siz bilan birga o\'sadi'
    }
};
```

## Responsive Design

All components are mobile-first and responsive:

```css
/* Desktop first */
@media (max-width: 768px) {
    .landing-nav {
        padding: 16px 5vw;
    }
    
    .landing-hero {
        padding: 60px 5vw 40px;
    }
}
```

## Best Practices

1. **Always use CSS variables** - Don't hardcode colors or spacing
2. **Maintain consistency** - Use existing component classes
3. **Add smooth transitions** - Make interactions feel polished
4. **Test both languages** - Ensure layouts work in RU and UZ
5. **Check mobile view** - Test responsive behavior
6. **Use semantic HTML** - Proper heading hierarchy, landmarks
7. **Optimize performance** - Use backdrop-filter sparingly
8. **Accessibility** - Maintain color contrast ratios

## Examples

### Example: Feature Section

```html
<section class="landing-section">
    <h2 data-i18n="featuresTitle">Почему ZEDLY</h2>
    <div class="landing-grid">
        <article class="landing-card">
            <i class="fas fa-chart-line"></i>
            <h3 data-i18n="feature1Title">Аналитика в реальном времени</h3>
            <p data-i18n="feature1Body">Отслеживайте прогресс по каждому классу.</p>
        </article>
        <!-- More cards... -->
    </div>
</section>
```

### Example: Call-to-Action Section

```html
<section class="landing-section landing-highlight">
    <div>
        <h2 data-i18n="ctaTitle">Готовы начать?</h2>
        <p data-i18n="ctaBody">Присоединяйтесь к платформе</p>
    </div>
    <a class="landing-btn landing-btn-primary" href="/login" data-i18n="ctaButton">
        Зарегистрироваться
    </a>
</section>
```

## Testing Checklist

Before pushing a new page:

- [ ] Check on desktop (1920px, 1366px)
- [ ] Check on tablet (768px)
- [ ] Check on mobile (375px, 320px)
- [ ] Test language toggle (RU ↔ UZ)
- [ ] Verify all hover effects work
- [ ] Check color contrast (WCAG AA)
- [ ] Test keyboard navigation
- [ ] Verify smooth transitions
- [ ] Check backdrop blur rendering
- [ ] Test on Chrome, Firefox, Safari

## Resources

- Main CSS: `/backend/public/css/main.css`
- Landing CSS: `/backend/public/css/landing.css`
- Example Page: `/backend/public/index.html`
- Font Awesome Icons: https://fontawesome.com/icons

---

**Questions?** Refer to the landing page implementation in `/backend/public/index.html` and `/backend/public/css/landing.css` for complete examples.
