/**
 * Authentic Pastoral Wooden Fence (木製の柵) SVG Graphic
 *
 * Replaces the confusing log emoji (🪵) with a clear, delightful 2-post
 * wood picket fence featuring warm timber grain, cross rails, and nail accents.
 */

export const FENCE_SVG = `<svg class="fence-svg" viewBox="0 0 32 32" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <!-- Left pointed picket post -->
  <path d="M6 7 L9 3 L12 7 L12 29 L6 29 Z" fill="#b9783f" stroke="#4a2508" stroke-width="1.6" stroke-linejoin="round"/>
  <!-- Right pointed picket post -->
  <path d="M20 7 L23 3 L26 7 L26 29 L20 29 Z" fill="#b9783f" stroke="#4a2508" stroke-width="1.6" stroke-linejoin="round"/>
  <!-- Upper horizontal cross rail -->
  <rect x="3" y="9" width="26" height="5" rx="1.2" fill="#d29054" stroke="#4a2508" stroke-width="1.6"/>
  <!-- Lower horizontal cross rail -->
  <rect x="3" y="18" width="26" height="5" rx="1.2" fill="#c48348" stroke="#4a2508" stroke-width="1.6"/>
  <!-- Nail accents where rails meet posts -->
  <circle cx="9" cy="11.5" r="0.9" fill="#4a2508"/>
  <circle cx="23" cy="11.5" r="0.9" fill="#4a2508"/>
  <circle cx="9" cy="20.5" r="0.9" fill="#4a2508"/>
  <circle cx="23" cy="20.5" r="0.9" fill="#4a2508"/>
</svg>`;
