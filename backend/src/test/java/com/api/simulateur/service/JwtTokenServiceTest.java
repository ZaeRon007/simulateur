package com.api.simulateur.service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;

class JwtTokenServiceTest {

    @Test
    void integerExpirationValueIsInterpretedAsDays() {
        JwtEncoder jwtEncoder = mock(JwtEncoder.class);
        JwtTokenService jwtTokenService = new JwtTokenService(jwtEncoder, "1");

        assertEquals(86_400L, jwtTokenService.getExpirationSeconds());
    }

    @Test
    void explicitHourExpirationValueIsSupported() {
        JwtEncoder jwtEncoder = mock(JwtEncoder.class);
        JwtTokenService jwtTokenService = new JwtTokenService(jwtEncoder, "24h");

        assertEquals(86_400L, jwtTokenService.getExpirationSeconds());
    }

    @Test
    void generateTokenUsesHs256HeaderAndReturnsEncodedValue() {
        JwtEncoder jwtEncoder = mock(JwtEncoder.class);
        JwtTokenService jwtTokenService = new JwtTokenService(jwtEncoder, "1h");

        Instant now = Instant.now();
        Jwt jwt = new Jwt(
            "encoded-token",
            now,
            now.plusSeconds(3600),
            Map.of("alg", "HS256"),
            Map.of("sub", "test@example.com")
        );

        ArgumentCaptor<JwtEncoderParameters> parametersCaptor = ArgumentCaptor.forClass(JwtEncoderParameters.class);
        when(jwtEncoder.encode(parametersCaptor.capture())).thenReturn(jwt);

        String token = jwtTokenService.generateToken(1L, "test@example.com", "tester");

        JwtEncoderParameters capturedParameters = parametersCaptor.getValue();
        assertNotNull(capturedParameters);
        assertEquals(MacAlgorithm.HS256.getName(), capturedParameters.getJwsHeader().getAlgorithm().getName());
        assertEquals("test@example.com", capturedParameters.getClaims().getSubject());
        assertEquals(
            3600L,
            Duration.between(
                capturedParameters.getClaims().getIssuedAt(),
                capturedParameters.getClaims().getExpiresAt()
            ).getSeconds()
        );
        assertEquals("encoded-token", token);
    }
}
