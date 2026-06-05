import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { mujocoReact } from 'mujoco-react/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    mujocoReact({
      models: [
        'public/models/franka_emika_panda/scene.xml',
        'public/models/so101/SO101.xml',
        'public/models/xlerobot/xlerobot.xml',
        'public/models/boston_dynamics_spot/scene.xml',
        'public/models/unitree_g1/scene.xml',
      ],
    }),
    tailwindcss(),
    react(),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei'],
    alias: {
      react: path.resolve('./node_modules/react'),
      'react-dom': path.resolve('./node_modules/react-dom'),
      three: path.resolve('./node_modules/three'),
      '@react-three/fiber': path.resolve('./node_modules/@react-three/fiber'),
      '@react-three/drei': path.resolve('./node_modules/@react-three/drei'),
    },
  },
});
