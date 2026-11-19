from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("devices", views.DeviceViewSet, basename="device")
router.register("maintains", views.MaintenanceViewSet, basename="maintain")
router.register("alarms", views.AlarmViewSet, basename="alarm")
router.register("alarm-rules", views.AlarmRuleViewSet, basename="alarm-rule")
router.register("workorders", views.WorkOrderViewSet, basename="workorder")
router.register("inspection/points", views.InspectionPointViewSet, basename="inspection-point")
router.register("inspection/routes", views.InspectionRouteViewSet, basename="inspection-route")
router.register("inspection/plans", views.InspectionPlanViewSet, basename="inspection-plan")
router.register("inspection/tasks", views.InspectionTaskViewSet, basename="inspection-task")
router.register("scene/snapshot", views.SceneSnapshotViewSet, basename="scene-snapshot")
router.register("logs", views.OperationLogViewSet, basename="log")
router.register("lines", views.LineViewSet, basename="line")
router.register("areas", views.AreaViewSet, basename="area")

urlpatterns = [
    # 认证
    path("auth/login/", views.LoginView.as_view()),
    path("auth/demo/", views.DemoLoginView.as_view()),
    path("auth/me/", views.MeView.as_view()),
    # 概览
    path("overview/stats/", views.OverviewStatsView.as_view()),
    path("overview/trend/", views.AlarmTrendView.as_view()),
    # 统计与报表
    path("energy/summary/", views.EnergySummaryView.as_view()),
    path("report/alarm/", views.AlarmReportView.as_view()),
    path("report/alarm/export/", views.AlarmExportView.as_view()),
    # 场景配置
    path("scene/config/", views.SceneConfigView.as_view()),
    path("", include(router.urls)),
]
