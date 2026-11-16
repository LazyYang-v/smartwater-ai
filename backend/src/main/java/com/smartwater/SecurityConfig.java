package com.smartwater;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.*;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.cors.*;
@Configuration @EnableMethodSecurity
public class SecurityConfig {
 @Bean PasswordEncoder passwordEncoder(){return new BCryptPasswordEncoder();}
 @Bean UserDetailsService users(Store db){return username->{var rows=db.rows("SELECT * FROM app_user WHERE username=? AND enabled=true",username);if(rows.isEmpty())throw new UsernameNotFoundException("账户不可用");var row=rows.get(0);return User.withUsername(username).password(row.get("password_hash").toString()).roles(row.get("role").toString()).build();};}
 static void error(HttpServletResponse response,int status,String code)throws IOException{response.setStatus(status);response.setContentType("application/json;charset=UTF-8");response.getWriter().write("{\"error\":{\"code\":\""+code+"\",\"message\":\"请检查登录状态和操作权限\"}}");}
 @Bean SecurityFilterChain security(HttpSecurity http,Store db,@Value("${SW_COLLECTOR_TOKEN}") String collector)throws Exception{
  if(collector.length()<24)throw new IllegalStateException("Collector credential must be configured locally");
  http.cors(c->c.configurationSource(cors())).csrf(c->c.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse()).csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()).ignoringRequestMatchers("/api/business/telemetry"))
   .authorizeHttpRequests(a->a.requestMatchers("/api/business/auth/csrf","/api/business/auth/login","/api/business/health","/error").permitAll().requestMatchers(HttpMethod.POST,"/api/business/telemetry").hasRole("COLLECTOR").requestMatchers("/api/business/**").hasAnyRole("ADMIN","OPERATOR","VIEWER").anyRequest().denyAll())
   .formLogin(f->f.loginProcessingUrl("/api/business/auth/login").successHandler((req,res,auth)->{db.audit(auth.getName(),"LOGIN",auth.getName(),Store.map("authenticated",true));res.setContentType("application/json;charset=UTF-8");db.json.writeValue(res.getOutputStream(),Store.map("username",auth.getName(),"roles",auth.getAuthorities().stream().map(Object::toString).toList()));}).failureHandler((req,res,e)->error(res,401,"LOGIN_FAILED")))
   .logout(l->l.logoutUrl("/api/business/auth/logout").logoutSuccessHandler((req,res,auth)->{res.setContentType("application/json");res.getWriter().write("{\"loggedOut\":true}");}))
   .exceptionHandling(e->e.authenticationEntryPoint((req,res,ex)->error(res,401,"AUTH_REQUIRED")).accessDeniedHandler((req,res,ex)->error(res,403,"FORBIDDEN")));
  http.addFilterBefore(new OncePerRequestFilter(){protected boolean shouldNotFilter(HttpServletRequest r){return !r.getRequestURI().equals("/api/business/telemetry");}protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)throws ServletException,IOException{String auth=request.getHeader("Authorization"),provided=auth!=null&&auth.startsWith("Bearer ")?auth.substring(7):"";if(!MessageDigest.isEqual(provided.getBytes(StandardCharsets.UTF_8),collector.getBytes(StandardCharsets.UTF_8))){error(response,401,"COLLECTOR_AUTH_REQUIRED");return;}var context=SecurityContextHolder.createEmptyContext();context.setAuthentication(new UsernamePasswordAuthenticationToken("collector",null,List.of(new SimpleGrantedAuthority("ROLE_COLLECTOR"))));SecurityContextHolder.setContext(context);try{chain.doFilter(request,response);}finally{SecurityContextHolder.clearContext();}}},UsernamePasswordAuthenticationFilter.class);
  return http.build();
 }
 CorsConfigurationSource cors(){var c=new CorsConfiguration();c.setAllowedOrigins(List.of("http://127.0.0.1:5173","http://127.0.0.1:4173","http://localhost:5173","http://localhost:4173"));c.setAllowedMethods(List.of("GET","POST"));c.setAllowedHeaders(List.of("Content-Type","X-XSRF-TOKEN","Idempotency-Key","Authorization"));c.setAllowCredentials(true);var source=new UrlBasedCorsConfigurationSource();source.registerCorsConfiguration("/api/business/**",c);return source;}
}
