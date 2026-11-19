"""
认证扩展
--------------------------------------------------------------
DRF 的 TokenAuthentication 默认只认 `Authorization: Token <key>`。
前端按主流习惯发送 `Bearer <key>`，这里注册一个关键字为 Bearer 的
子类，两种写法同时可用，便于将来替换为 JWT 时不改调用方。
"""
from rest_framework.authentication import TokenAuthentication


class BearerTokenAuthentication(TokenAuthentication):
    keyword = "Bearer"
