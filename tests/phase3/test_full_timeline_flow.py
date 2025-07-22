#!/usr/bin/env python3
"""
Full Timeline Flow Integration Test - Phase 3

Tests the complete integration of Phase 1 (Timeline Events), Phase 2 (Chunked Generation), 
and Phase 3 (Responsive Layout Engine) working together as a unified system.
"""

import asyncio
import httpx
import json
import time
import traceback
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, asdict
from datetime import datetime

# Configuration
BASE_URL = "http://localhost:8000"
API_BASE = f"{BASE_URL}/api"

@dataclass
class TimelineEvent:
    id: str
    content: str
    semantic_type: str
    start_time: float
    duration: float
    complexity: str

@dataclass
class TestMetrics:
    total_time: float
    memory_usage: float
    elements_generated: int
    seek_operations: int
    avg_seek_time: float
    collision_detections: int
    cache_efficiency: float

@dataclass
class PhaseResults:
    phase1_events: int
    phase2_chunks: int
    phase3_elements: int
    integration_success: bool
    error_details: Optional[str] = None

class FullTimelineIntegrationTester:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=300.0)  # Extended timeout for complex operations
        self.test_results = []
        self.performance_metrics = {}
        
    async def test_system_health(self) -> Dict[str, Any]:
        """Test that all system components are healthy before integration testing"""
        print("🔍 Testing system health...")
        
        health_checks = []
        
        # Backend health
        try:
            response = await self.client.get(f"{API_BASE}/health")
            health_checks.append({
                "component": "backend",
                "status": "healthy" if response.status_code == 200 else "unhealthy",
                "details": response.json() if response.status_code == 200 else response.text
            })
        except Exception as e:
            health_checks.append({
                "component": "backend",
                "status": "error",
                "details": str(e)
            })
        
        # LLM health
        try:
            response = await self.client.get(f"{API_BASE}/llm/health")
            health_checks.append({
                "component": "llm",
                "status": "healthy" if response.status_code == 200 else "unhealthy",
                "details": response.json() if response.status_code == 200 else response.text
            })
        except Exception as e:
            health_checks.append({
                "component": "llm",
                "status": "error", 
                "details": str(e)
            })
        
        all_healthy = all(check["status"] == "healthy" for check in health_checks)
        
        print(f"   {'✅' if all_healthy else '❌'} System health: {'All systems operational' if all_healthy else 'Some systems have issues'}")
        
        return {
            "overall_health": all_healthy,
            "components": health_checks
        }

    async def test_phase1_timeline_events(self, topic: str, difficulty: str) -> PhaseResults:
        """Test Phase 1: Timeline event creation and analysis"""
        print(f"📊 Testing Phase 1: Timeline Events for '{topic}'...")
        
        try:
            start_time = time.time()
            
            # Test timeline event analysis
            response = await self.client.post(f"{API_BASE}/lesson/analyze-timeline", json={
                "topic": topic,
                "difficulty_level": difficulty,
                "content_type": "process",
                "target_duration": 90,
                "user_id": "integration_test"
            })
            
            if not response.is_success:
                return PhaseResults(
                    phase1_events=0,
                    phase2_chunks=0, 
                    phase3_elements=0,
                    integration_success=False,
                    error_details=f"Phase 1 API error: {response.status_code} - {response.text}"
                )
            
            result = response.json()
            events_created = result.get("timeline_events", 0)
            
            processing_time = time.time() - start_time
            
            print(f"   ✅ Phase 1 completed: {events_created} timeline events in {processing_time:.2f}s")
            
            return PhaseResults(
                phase1_events=events_created,
                phase2_chunks=0,
                phase3_elements=0,
                integration_success=True
            )
            
        except Exception as e:
            print(f"   ❌ Phase 1 failed: {str(e)}")
            return PhaseResults(
                phase1_events=0,
                phase2_chunks=0,
                phase3_elements=0,
                integration_success=False,
                error_details=str(e)
            )

    async def test_phase2_chunked_generation(self, topic: str, difficulty: str) -> PhaseResults:
        """Test Phase 2: Chunked content generation with continuity"""
        print(f"🔄 Testing Phase 2: Chunked Generation for '{topic}'...")
        
        try:
            start_time = time.time()
            
            # Test chunked lesson generation
            response = await self.client.post(f"{API_BASE}/lesson/chunked", json={
                "topic": topic,
                "difficulty_level": difficulty,
                "content_type": "process",
                "target_duration": 90,
                "user_id": "integration_test",
                "enable_continuity": True
            })
            
            if not response.is_success:
                return PhaseResults(
                    phase1_events=0,
                    phase2_chunks=0,
                    phase3_elements=0,
                    integration_success=False,
                    error_details=f"Phase 2 API error: {response.status_code} - {response.text}"
                )
            
            result = response.json()
            chunks_created = result.get("total_chunks", 0)
            timeline_events = sum(len(chunk.get("timeline_events", [])) for chunk in result.get("chunks", []))
            
            processing_time = time.time() - start_time
            
            print(f"   ✅ Phase 2 completed: {chunks_created} chunks with {timeline_events} events in {processing_time:.2f}s")
            
            return PhaseResults(
                phase1_events=timeline_events,
                phase2_chunks=chunks_created,
                phase3_elements=0,
                integration_success=True
            )
            
        except Exception as e:
            print(f"   ❌ Phase 2 failed: {str(e)}")
            return PhaseResults(
                phase1_events=0,
                phase2_chunks=0,
                phase3_elements=0,
                integration_success=False,
                error_details=str(e)
            )

    async def test_phase3_layout_engine(self, topic: str, timeline_events: List[Dict]) -> PhaseResults:
        """Test Phase 3: Timeline layout engine with responsive regions"""
        print(f"🎨 Testing Phase 3: Layout Engine for '{topic}'...")
        
        try:
            start_time = time.time()
            
            # Test timeline layout generation
            response = await self.client.post(f"{API_BASE}/layout/timeline", json={
                "timeline_events": timeline_events,
                "canvas_size": {"width": 1200, "height": 800},
                "layout_mode": "responsive",
                "enable_smart_elements": True,
                "enable_collision_detection": True
            })
            
            if not response.is_success:
                return PhaseResults(
                    phase1_events=0,
                    phase2_chunks=0,
                    phase3_elements=0,
                    integration_success=False,
                    error_details=f"Phase 3 API error: {response.status_code} - {response.text}"
                )
            
            result = response.json()
            elements_created = len(result.get("elements", []))
            regions_used = len(result.get("regions", []))
            
            processing_time = time.time() - start_time
            
            print(f"   ✅ Phase 3 completed: {elements_created} elements in {regions_used} regions in {processing_time:.2f}s")
            
            return PhaseResults(
                phase1_events=len(timeline_events),
                phase2_chunks=0,
                phase3_elements=elements_created,
                integration_success=True
            )
            
        except Exception as e:
            print(f"   ❌ Phase 3 failed: {str(e)}")
            return PhaseResults(
                phase1_events=0,
                phase2_chunks=0,
                phase3_elements=0,
                integration_success=False,
                error_details=str(e)
            )

    async def test_timeline_seek_performance(self, topic: str) -> Dict[str, Any]:
        """Test timeline seeking performance across the full integration"""
        print("⚡ Testing timeline seek performance...")
        
        seek_times = []
        timestamps = [0, 1000, 2500, 5000, 7500, 10000, 15000]  # Various timeline positions
        
        try:
            for timestamp in timestamps:
                start_time = time.time()
                
                response = await self.client.post(f"{API_BASE}/timeline/seek", json={
                    "topic": topic,
                    "timestamp": timestamp,
                    "canvas_size": {"width": 1200, "height": 800}
                })
                
                seek_time = (time.time() - start_time) * 1000  # Convert to milliseconds
                seek_times.append({
                    "timestamp": timestamp,
                    "seek_time_ms": seek_time,
                    "success": response.is_success,
                    "elements_rendered": len(response.json().get("elements", [])) if response.is_success else 0
                })
                
                if response.is_success:
                    print(f"   ✅ Seek to {timestamp}ms: {seek_time:.2f}ms")
                else:
                    print(f"   ❌ Seek to {timestamp}ms failed: {response.status_code}")
            
            avg_seek_time = sum(s["seek_time_ms"] for s in seek_times if s["success"]) / len([s for s in seek_times if s["success"]]) if seek_times else 0
            success_rate = len([s for s in seek_times if s["success"]]) / len(seek_times) if seek_times else 0
            
            print(f"   📊 Average seek time: {avg_seek_time:.2f}ms, Success rate: {success_rate*100:.1f}%")
            
            return {
                "seek_tests": seek_times,
                "avg_seek_time_ms": avg_seek_time,
                "success_rate": success_rate,
                "total_seeks": len(seek_times)
            }
            
        except Exception as e:
            print(f"   ❌ Seek performance test failed: {str(e)}")
            return {
                "seek_tests": [],
                "avg_seek_time_ms": 0,
                "success_rate": 0,
                "total_seeks": 0,
                "error": str(e)
            }

    async def test_collision_detection_stress(self) -> Dict[str, Any]:
        """Stress test the collision detection system with many elements"""
        print("🔍 Testing collision detection under stress...")
        
        try:
            start_time = time.time()
            
            response = await self.client.post(f"{API_BASE}/layout/collision-stress-test", json={
                "element_count": 100,  # Generate many elements
                "canvas_size": {"width": 1200, "height": 800},
                "enable_avoidance": True,
                "max_iterations": 50
            })
            
            processing_time = time.time() - start_time
            
            if response.is_success:
                result = response.json()
                print(f"   ✅ Collision detection: {result.get('resolved_collisions', 0)} collisions resolved in {processing_time:.2f}s")
                
                return {
                    "success": True,
                    "initial_collisions": result.get("initial_collisions", 0),
                    "resolved_collisions": result.get("resolved_collisions", 0),
                    "processing_time_s": processing_time,
                    "elements_processed": result.get("elements_processed", 0)
                }
            else:
                print(f"   ❌ Collision detection stress test failed: {response.status_code}")
                return {
                    "success": False,
                    "error": f"API error: {response.status_code} - {response.text}"
                }
                
        except Exception as e:
            print(f"   ❌ Collision detection stress test failed: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }

    async def test_full_integration(self, topic: str, difficulty: str = "intermediate") -> Dict[str, Any]:
        """Test complete end-to-end integration of all three phases"""
        print(f"🚀 Testing FULL INTEGRATION: {topic}")
        print("=" * 60)
        
        integration_start_time = time.time()
        
        try:
            # Step 1: Test full pipeline with single API call
            response = await self.client.post(f"{API_BASE}/integration/full-timeline", json={
                "topic": topic,
                "difficulty_level": difficulty,
                "target_duration": 120,
                "canvas_size": {"width": 1200, "height": 800},
                "enable_timeline_layout": True,
                "enable_smart_elements": True,
                "enable_collision_detection": True,
                "layout_mode": "responsive",
                "user_id": "integration_test"
            })
            
            if not response.is_success:
                return {
                    "success": False,
                    "error": f"Integration API failed: {response.status_code} - {response.text}",
                    "total_time_s": time.time() - integration_start_time
                }
            
            result = response.json()
            
            # Extract phase results
            phase_results = PhaseResults(
                phase1_events=result.get("timeline_events_count", 0),
                phase2_chunks=result.get("chunks_generated", 0),
                phase3_elements=result.get("elements_generated", 0),
                integration_success=result.get("success", False)
            )
            
            integration_time = time.time() - integration_start_time
            
            # Additional performance tests
            print("\n🔬 Running performance tests...")
            seek_performance = await self.test_timeline_seek_performance(topic)
            collision_results = await self.test_collision_detection_stress()
            
            # Compile comprehensive results
            final_results = {
                "integration_success": phase_results.integration_success,
                "topic": topic,
                "difficulty": difficulty,
                "phases": asdict(phase_results),
                "performance": {
                    "total_integration_time_s": integration_time,
                    "seek_performance": seek_performance,
                    "collision_detection": collision_results,
                    "memory_usage_mb": result.get("memory_usage_bytes", 0) / (1024 * 1024),
                    "cache_efficiency": result.get("cache_hit_rate", 0)
                },
                "quality_metrics": {
                    "elements_per_event": phase_results.phase3_elements / max(phase_results.phase1_events, 1),
                    "chunks_per_minute": phase_results.phase2_chunks / (120 / 60),  # target_duration is 120s
                    "layout_efficiency": result.get("layout_efficiency_score", 0)
                },
                "timestamp": datetime.now().isoformat()
            }
            
            # Print comprehensive summary
            self.print_integration_summary(final_results)
            
            return final_results
            
        except Exception as e:
            integration_time = time.time() - integration_start_time
            error_result = {
                "integration_success": False,
                "topic": topic,
                "error": str(e),
                "error_traceback": traceback.format_exc(),
                "total_time_s": integration_time,
                "timestamp": datetime.now().isoformat()
            }
            
            print(f"\n❌ INTEGRATION FAILED: {str(e)}")
            print(f"📊 Total time before failure: {integration_time:.2f}s")
            
            return error_result

    def print_integration_summary(self, results: Dict[str, Any]):
        """Print a comprehensive summary of integration test results"""
        print("\n" + "=" * 60)
        print("📊 FULL INTEGRATION TEST SUMMARY")
        print("=" * 60)
        
        success = results["integration_success"]
        print(f"🎯 Overall Status: {'✅ SUCCESS' if success else '❌ FAILED'}")
        print(f"📚 Topic: {results['topic']}")
        print(f"⏱️  Total Integration Time: {results['performance']['total_integration_time_s']:.2f}s")
        
        print("\n📈 PHASE RESULTS:")
        phases = results["phases"]
        print(f"   Phase 1 (Timeline Events): {phases['phase1_events']} events")
        print(f"   Phase 2 (Chunked Generation): {phases['phase2_chunks']} chunks") 
        print(f"   Phase 3 (Layout Engine): {phases['phase3_elements']} elements")
        
        print("\n⚡ PERFORMANCE METRICS:")
        perf = results["performance"]
        print(f"   Average Seek Time: {perf['seek_performance']['avg_seek_time_ms']:.2f}ms")
        print(f"   Seek Success Rate: {perf['seek_performance']['success_rate']*100:.1f}%")
        print(f"   Memory Usage: {perf['memory_usage_mb']:.2f}MB")
        print(f"   Cache Efficiency: {perf['cache_efficiency']*100:.1f}%")
        
        if perf['collision_detection']['success']:
            print(f"   Collision Resolution: {perf['collision_detection']['resolved_collisions']} resolved")
        
        print("\n🎨 QUALITY METRICS:")
        quality = results["quality_metrics"]
        print(f"   Elements per Event: {quality['elements_per_event']:.1f}")
        print(f"   Chunks per Minute: {quality['chunks_per_minute']:.1f}")
        print(f"   Layout Efficiency: {quality['layout_efficiency']*100:.1f}%")
        
        print("\n" + "=" * 60)

    async def run_comprehensive_test_suite(self):
        """Run a comprehensive test suite covering multiple scenarios"""
        print("🧪 COMPREHENSIVE PHASE 3 INTEGRATION TEST SUITE")
        print("=" * 70)
        
        test_scenarios = [
            ("Photosynthesis Process", "beginner"),
            ("Quantum Mechanics Basics", "intermediate"), 
            ("Machine Learning Algorithms", "advanced"),
            ("Economic Supply and Demand", "intermediate")
        ]
        
        all_results = []
        overall_start_time = time.time()
        
        # System health check first
        health_result = await self.test_system_health()
        if not health_result["overall_health"]:
            print("❌ System health check failed. Aborting test suite.")
            return
        
        print(f"\n✅ System health check passed. Running {len(test_scenarios)} integration tests...\n")
        
        for i, (topic, difficulty) in enumerate(test_scenarios, 1):
            print(f"\n{'='*20} TEST {i}/{len(test_scenarios)} {'='*20}")
            
            result = await self.test_full_integration(topic, difficulty)
            all_results.append(result)
            
            # Brief pause between tests to avoid overwhelming the system
            if i < len(test_scenarios):
                print("⏳ Pausing 2 seconds before next test...")
                await asyncio.sleep(2)
        
        # Final comprehensive summary
        total_suite_time = time.time() - overall_start_time
        successful_tests = len([r for r in all_results if r["integration_success"]])
        
        print("\n" + "=" * 70)
        print("🏆 COMPREHENSIVE TEST SUITE SUMMARY")
        print("=" * 70)
        print(f"📊 Tests Run: {len(test_scenarios)}")
        print(f"✅ Successful: {successful_tests}")
        print(f"❌ Failed: {len(test_scenarios) - successful_tests}")
        print(f"📈 Success Rate: {(successful_tests/len(test_scenarios)*100):.1f}%")
        print(f"⏱️  Total Suite Time: {total_suite_time:.2f}s")
        
        if successful_tests > 0:
            avg_integration_time = sum(r["performance"]["total_integration_time_s"] for r in all_results if r["integration_success"]) / successful_tests
            avg_seek_time = sum(r["performance"]["seek_performance"]["avg_seek_time_ms"] for r in all_results if r["integration_success"]) / successful_tests
            
            print(f"📊 Average Integration Time: {avg_integration_time:.2f}s")
            print(f"⚡ Average Seek Time: {avg_seek_time:.2f}ms")
        
        print("=" * 70)
        
        # Save results to file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        results_file = f"phase3_integration_results_{timestamp}.json"
        
        with open(results_file, 'w') as f:
            json.dump({
                "test_suite_summary": {
                    "total_tests": len(test_scenarios),
                    "successful_tests": successful_tests,
                    "success_rate": successful_tests/len(test_scenarios),
                    "total_suite_time_s": total_suite_time,
                    "timestamp": datetime.now().isoformat()
                },
                "individual_test_results": all_results
            }, f, indent=2)
        
        print(f"💾 Detailed results saved to: {results_file}")

async def main():
    """Main test execution"""
    tester = FullTimelineIntegrationTester()
    
    try:
        # Run the comprehensive test suite
        await tester.run_comprehensive_test_suite()
        
    except KeyboardInterrupt:
        print("\n⚠️  Test suite interrupted by user")
    except Exception as e:
        print(f"\n❌ Test suite failed with unexpected error: {str(e)}")
        traceback.print_exc()
    finally:
        await tester.client.aclose()

if __name__ == "__main__":
    print("🚀 Starting Phase 3 Full Timeline Integration Tests")
    print("   Make sure the backend is running on port 8000")
    print("   Ensure Ollama with Gemma 3n model is available")
    print("   Verify MongoDB is running")
    print()
    
    asyncio.run(main())