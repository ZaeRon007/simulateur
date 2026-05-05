package com.api.simulateur.service;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

@Service
public class JwtTokenService {

    private final JwtEncoder jwtEncoder;
    private final long expirationSeconds;

    public JwtTokenService(
        JwtEncoder jwtEncoder,
        @Value("${security.jwt.expiration-time}") String expirationTime
    ) {
        this.jwtEncoder = jwtEncoder;
        this.expirationSeconds = parseExpirationSeconds(expirationTime);
    }

    public String generateToken(Long userId, String email, String name) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
            .issuer("simulateur-api")
            .issuedAt(now)
            .expiresAt(now.plusSeconds(expirationSeconds))
            .subject(email)
            .claim("uid", userId)
            .claim("name", name)
            .build();

        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return jwtEncoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }

    public long getExpirationSeconds() {
        return expirationSeconds;
    }

    private long parseExpirationSeconds(String expirationTime) {
        if (expirationTime == null || expirationTime.isBlank()) {
            throw new IllegalArgumentException("security.jwt.expiration-time must not be blank");
        }

        String value = expirationTime.trim().toLowerCase(Locale.ROOT);

        if (value.matches("\\d+")) {
            // Backward-compatible with current .env usage: integer means days.
            return Duration.ofDays(Long.parseLong(value)).getSeconds();
        }

        if (value.matches("\\d+[smhd]")) {
            long amount = Long.parseLong(value.substring(0, value.length() - 1));
            char unit = value.charAt(value.length() - 1);

            return switch (unit) {
                case 's' -> Duration.ofSeconds(amount).getSeconds();
                case 'm' -> Duration.ofMinutes(amount).getSeconds();
                case 'h' -> Duration.ofHours(amount).getSeconds();
                case 'd' -> Duration.ofDays(amount).getSeconds();
                default -> throw new IllegalArgumentException("Unsupported expiration unit: " + unit);
            };
        }

        try {
            return Duration.parse(value).getSeconds();
        } catch (Exception exception) {
            throw new IllegalArgumentException(
                "Invalid security.jwt.expiration-time value: " + expirationTime,
                exception
            );
        }
    }
}
