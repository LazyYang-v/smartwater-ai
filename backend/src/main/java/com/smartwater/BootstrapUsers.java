package com.smartwater;
import java.util.*;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
@Component
public class BootstrapUsers implements ApplicationRunner {
 final Store db;final Environment env;final PasswordEncoder encoder;
 public BootstrapUsers(Store db,Environment env,PasswordEncoder encoder){this.db=db;this.env=env;this.encoder=encoder;}
 public void run(ApplicationArguments args){for(String role:List.of("ADMIN","OPERATOR","VIEWER")){String username=role.toLowerCase(Locale.ROOT);if(!db.rows("SELECT username FROM app_user WHERE username=?",username).isEmpty())continue;String password=env.getProperty("SW_"+role+"_PASSWORD","");if(password.length()<12)throw new IllegalStateException("Local bootstrap password required for "+role);db.jdbc.update("INSERT INTO app_user(username,password_hash,role) VALUES(?,?,?)",username,encoder.encode(password),role);}}
}
