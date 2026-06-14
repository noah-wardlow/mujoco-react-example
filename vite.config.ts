import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { mujocoReact } from 'mujoco-react/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    mujocoReact({
      models: {
        franka: 'public/models/franka_emika_panda/scene.xml',
        so101: 'public/models/so101/SO101.xml',
        xlerobot: 'public/models/xlerobot/xlerobot.xml',
        spot: 'public/models/boston_dynamics_spot/scene.xml',
        g1: 'public/models/unitree_g1/scene.xml',
      },
    }),
    tailwindcss(),
    react(),
  ],
  build: {
    // The Spark (gaussian-splat) lazy chunk is ~5 MB by nature; keep the limit
    // above it so the example build stays warning-clean.
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@react-three/')) return 'r3f';
          if (id.includes('node_modules/three/')) return 'three';
        },
      },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei'],
    alias: {
      react: path.resolve('./node_modules/react'),
      'react-dom': path.resolve('./node_modules/react-dom'),
      'three/addons': path.resolve('./node_modules/three/examples/jsm'),
      three: path.resolve('./node_modules/three'),
      '@react-three/fiber': path.resolve('./node_modules/@react-three/fiber'),
      '@react-three/drei': path.resolve('./node_modules/@react-three/drei'),
    },
  },
});
