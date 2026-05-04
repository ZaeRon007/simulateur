package com.api.simulateur.config;

import org.springframework.context.annotation.Configuration;

import io.github.cdimascio.dotenv.Dotenv;

@Configuration
public class EnvConfiguration {

    static {
        Dotenv dotenv = Dotenv.configure()
            .directory("./")
            .ignoreIfMissing()
            .load();
        
        // Load environment variables into System properties for Spring to use
        if (dotenv.get("SECURITY_JWT_SECRET_KEY") != null) {
            System.setProperty("security.jwt.secret-key", dotenv.get("SECURITY_JWT_SECRET_KEY"));
        }
        if (dotenv.get("SECURITY_JWT_EXPIRATION_TIME") != null) {
            System.setProperty("security.jwt.expiration-time", dotenv.get("SECURITY_JWT_EXPIRATION_TIME"));
        }
    }
}
