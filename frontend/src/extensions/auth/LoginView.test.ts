import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import LoginView from './LoginView.vue'
const success=(data:unknown)=>({ok:true,json:async()=>({code:0,data})})
beforeEach(()=>{localStorage.clear();history.replaceState({},'', '/fastaiui/login?redirect='+encodeURIComponent('/fastaiui/admin/client-releases?product_id=xiaoxiao-manju'))})
afterEach(()=>vi.unstubAllGlobals())
it('completes the existing two-step login before storing a token and returns to management',async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(success({})).mockResolvedValueOnce(success({requires_2fa:true,temp_token:'temporary-proof'})).mockResolvedValueOnce(success({access_token:'test-bearer',user:{role:'admin'}}));vi.stubGlobal('fetch',fetch)
 const w=mount(LoginView);await flushPromises();await w.get('input[type=email]').setValue('test@example.invalid');await w.get('input[type=password]').setValue('test-password');await w.get('form').trigger('submit');await flushPromises()
 expect(localStorage.getItem('auth_token')).toBeNull();expect(w.emitted('authenticated')).toBeUndefined();expect(w.find('input[type=password]').exists()).toBe(false)
 await w.get('input[autocomplete=one-time-code]').setValue('123456');await w.get('form').trigger('submit');await flushPromises()
 expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({temp_token:'temporary-proof',totp_code:'123456'});expect(localStorage.getItem('auth_token')).toBe('test-bearer');expect(w.emitted('authenticated')).toEqual([['/fastaiui/admin/client-releases?product_id=xiaoxiao-manju']]);w.unmount()
})
it('rejects external return URLs and never bypasses configured captcha',async()=>{
 history.replaceState({},'', '/fastaiui/login?redirect=https://untrusted.example')
 const fetch=vi.fn().mockResolvedValue(success({turnstile_enabled:true}));vi.stubGlobal('fetch',fetch)
 const w=mount(LoginView);await flushPromises();expect(w.find('form').exists()).toBe(false);expect(w.get('a[href^="https://fastaiapi.cloud/login"]').attributes('href')).toBe('https://fastaiapi.cloud/login?redirect=%2Ffastaiui%2Frecharge');expect(fetch).toHaveBeenCalledTimes(1);w.unmount()
})
it('does not replace a valid session on a failed login response',async()=>{
 localStorage.setItem('auth_token','existing');const fetch=vi.fn().mockResolvedValueOnce(success({})).mockResolvedValueOnce({ok:false,json:async()=>({message:'账号或密码错误'})});vi.stubGlobal('fetch',fetch)
 const w=mount(LoginView);await flushPromises();await w.get('input[type=email]').setValue('test@example.invalid');await w.get('input[type=password]').setValue('wrong-password');await w.get('form').trigger('submit');await flushPromises();expect(w.get('[role=alert]').text()).toBe('账号或密码错误');expect(localStorage.getItem('auth_token')).toBe('existing');expect(w.emitted('authenticated')).toBeUndefined();w.unmount()
})
