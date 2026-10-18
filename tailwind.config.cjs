module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Couleurs du centre (variables CSS mises à jour depuis le logo / la personnalisation)
        brand: { DEFAULT: 'rgb(var(--brand) / <alpha-value>)', dark: 'rgb(var(--brand-dark) / <alpha-value>)' },
        accent: 'rgb(var(--accent) / <alpha-value>)',
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translate(0,0) scale(1)' }, '50%': { transform: 'translate(30px,-40px) scale(1.1)' } },
        rise: { '0%': { transform: 'translateY(0)', opacity: '0' }, '8%': { opacity: '1' }, '92%': { opacity: '1' }, '100%': { transform: 'translateY(-115vh)', opacity: '0' } },
        gradientShift: { '0%,100%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' } },
        kenburns: { '0%': { transform: 'scale(1)' }, '100%': { transform: 'scale(1.12) translate(-1.5%,-1.5%)' } },
        fadeUp: { '0%': { opacity: '0', transform: 'translateY(16px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        pop: { '0%': { opacity: '0', transform: 'scale(.95)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      animation: {
        float: 'float 14s ease-in-out infinite',
        'float-slow': 'float 22s ease-in-out infinite',
        rise: 'rise 20s linear infinite',
        'gradient-shift': 'gradientShift 18s ease infinite',
        kenburns: 'kenburns 30s ease-in-out infinite alternate',
        'fade-up': 'fadeUp .7s ease-out both',
        pop: 'pop .18s ease-out both',
        shimmer: 'shimmer 3s linear infinite',
      },
    },
  },
  plugins: [],
};
