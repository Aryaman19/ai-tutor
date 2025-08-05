#!/usr/bin/env python3
"""
Database migration script to update LLM settings schema.
Removes old fields (temperature, max_tokens, etc.) and adds new fields (timing, difficulty).
"""

import asyncio
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient
from config import settings

async def migrate_settings():
    """Migrate LLM settings to new schema"""
    
    client = None
    try:
        # Connect to MongoDB
        client = AsyncIOMotorClient(settings.mongodb_url)
        db = client[settings.database_name]
        collection = db.user_settings
        
        print("🔄 Starting settings migration...")
        
        # Get all user settings
        cursor = collection.find({})
        updated_count = 0
        
        async for document in cursor:
            if 'llm' in document:
                llm_settings = document['llm']
                needs_update = False
                
                # Remove old fields
                old_fields = ['temperature', 'max_tokens', 'top_p', 'frequency_penalty', 'presence_penalty']
                for field in old_fields:
                    if field in llm_settings:
                        del llm_settings[field]
                        needs_update = True
                
                # Add new fields with defaults if they don't exist
                if 'timing' not in llm_settings:
                    llm_settings['timing'] = 'short'
                    needs_update = True
                
                if 'difficulty' not in llm_settings:
                    llm_settings['difficulty'] = 'intermediate'
                    needs_update = True
                
                # Update the document if needed
                if needs_update:
                    await collection.update_one(
                        {'_id': document['_id']},
                        {
                            '$set': {
                                'llm': llm_settings,
                                'updated_at': document.get('updated_at')
                            }
                        }
                    )
                    updated_count += 1
                    print(f"✅ Updated settings for user: {document.get('user_id', 'unknown')}")
        
        print(f"🎉 Migration completed! Updated {updated_count} user settings.")
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        raise
    finally:
        if client:
            client.close()

if __name__ == "__main__":
    asyncio.run(migrate_settings())