from ninja_jwt.authentication import JWTAuth
from ninja_jwt.exceptions import AuthenticationFailed


class AppJWTAuth(JWTAuth):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if user.password_reset_active():
            raise AuthenticationFailed("Complete your password reset before signing in again.")
        if validated_token.get("password_version", 0) != user.password_version:
            raise AuthenticationFailed("Your password changed. Please sign in again.")
        return user
