<template>
  <div class="washi-hero-brand">
    <svg
      class="washi-hero-logo-svg"
      role="img"
      aria-label="WaSHI"
      viewBox="0 0 590 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>WaSHI</title>
      <defs>
        <linearGradient id="heroLogoRedTop" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FF385C" />
          <stop offset="100%" stop-color="#E11D48" />
        </linearGradient>
        <linearGradient id="heroLogoRedBottom" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#BE123C" />
          <stop offset="100%" stop-color="#881337" />
        </linearGradient>
        <linearGradient id="heroLogoRedNeck" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FB7185" />
          <stop offset="100%" stop-color="#E11D48" />
        </linearGradient>
        <linearGradient id="heroLogoBodyLeft" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#E11D48" />
          <stop offset="100%" stop-color="#9333EA" />
        </linearGradient>
        <linearGradient id="heroLogoBodyRight" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#9333EA" />
          <stop offset="100%" stop-color="#4F46E5" />
        </linearGradient>
        <linearGradient id="heroLogoIndigoTop" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#6366F1" />
          <stop offset="100%" stop-color="#4F46E5" />
        </linearGradient>
        <linearGradient id="heroLogoIndigoBottom" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#4338CA" />
          <stop offset="100%" stop-color="#312E81" />
        </linearGradient>
        <linearGradient id="heroLogoIndigoTail" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#818CF8" />
          <stop offset="100%" stop-color="#4F46E5" />
        </linearGradient>
      </defs>

      <g transform="translate(0, 8)">
        <g
          transform="translate(0, 0) scale(0.62)"
          stroke="#FFFFFF"
          stroke-opacity="0.2"
          stroke-width="0.8"
          stroke-linejoin="round"
        >
          <polygon points="120,110 75,35 60,50 95,120" fill="url(#heroLogoRedNeck)" />
          <polygon points="75,35 60,50 50,42" fill="#E11D48" />
          <polygon points="120,110 165,35 145,120" fill="url(#heroLogoIndigoTail)" />
          <polygon points="120,110 15,55 95,145" fill="url(#heroLogoRedTop)" />
          <polygon points="15,55 95,145 70,170" fill="url(#heroLogoRedBottom)" />
          <polygon points="120,110 225,55 145,145" fill="url(#heroLogoIndigoTop)" />
          <polygon points="225,55 145,145 170,170" fill="url(#heroLogoIndigoBottom)" />
          <polygon points="120,110 95,145 120,195" fill="url(#heroLogoBodyLeft)" />
          <polygon points="120,110 145,145 120,195" fill="url(#heroLogoBodyRight)" />
          <circle cx="15" cy="55" r="4.5" fill="#FFFFFF" stroke="#E11D48" stroke-width="2" />
          <circle cx="225" cy="55" r="4.5" fill="#FFFFFF" stroke="#4F46E5" stroke-width="2" />
          <circle cx="120" cy="195" r="4.5" fill="#FFFFFF" stroke="#9333EA" stroke-width="2" />
          <circle cx="120" cy="110" r="3.5" fill="#FFFFFF" stroke="#C026D3" stroke-width="1.8" />
        </g>

        <g transform="translate(155, 96)">
          <text
            font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
            font-weight="900"
            font-size="88"
            letter-spacing="-2"
          >
            <tspan class="hero-logo-was" fill="#0F172A">WaS</tspan><tspan fill="#E11D48">HI</tspan>
          </text>
          <text
            x="6"
            y="34"
            font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
            font-weight="700"
            font-size="14.5"
            letter-spacing="4"
            class="hero-logo-sub"
            fill="#64748B"
          >
            ALGEBRAIC MODELER
          </text>
        </g>
      </g>
    </svg>
  </div>
</template>
