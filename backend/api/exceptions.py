from rest_framework.views import exception_handler


def unified_exception_handler(exc, context):
    """统一错误体：{code, message, detail}"""
    response = exception_handler(exc, context)
    if response is None:
        return None
    detail = response.data
    code = getattr(exc, "default_code", "ERROR")
    if isinstance(detail, dict) and "detail" in detail:
        message = str(detail["detail"])
    elif isinstance(detail, list):
        message = "; ".join(str(x) for x in detail)
    else:
        message = str(detail)
    response.data = {"code": str(code).upper(), "message": message, "detail": detail}
    return response
