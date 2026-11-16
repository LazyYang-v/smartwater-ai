import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({ plugins: [vue()],server:{proxy:{'/api/agent':'http://127.0.0.1:8787'}},preview:{proxy:{'/api/agent':'http://127.0.0.1:8787'}}, build:{rolldownOptions:{input:{dashboard:"index.html",viewer:"viewer.html"}}} })
