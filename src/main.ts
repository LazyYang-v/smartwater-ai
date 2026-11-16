import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'

const app=createApp(App)
app.mount('#app')
if(import.meta.env.DEV||new URLSearchParams(location.search).has('qa'))Object.assign(window,{__SW_QA_UNMOUNT__:()=>app.unmount()})
