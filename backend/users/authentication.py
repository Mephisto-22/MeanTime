from ninja_jwt.authentication import JWTAuth
from ninja_jwt.exceptions import AuthenticationFailed
from ninja_jwt.token_blacklist.models import BlacklistedToken
from django.db.models import Q


class AppJWTAuth(JWTAuth):
    def get_user(self, validated_token):
        revoked = Q(token__jti=validated_token["jti"])
        if validated_token.get("session_jti"):
            revoked |= Q(token__jti=validated_token["session_jti"])
        if BlacklistedToken.objects.filter(revoked).exists():
            raise AuthenticationFailed("This session has been logged out. Please sign in again.")
        user = super().get_user(validated_token)
        if user.password_reset_active():
            raise AuthenticationFailed("Complete your password reset before signing in again.")
        if validated_token.get("password_version", 0) != user.password_version:
            raise AuthenticationFailed("Your password changed. Please sign in again.")
        return user
