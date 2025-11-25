# Make Me a Hanzi - Docker Setup Guide

This guide explains how to run the Make Me a Hanzi project using Docker with Meteor 1.4.1.1.

## Prerequisites

-   Docker installed and running
-   Docker Compose installed
-   Git (to clone/manage the repository)

## Project Structure

```
makemeahanzi/
├── Dockerfile              # Docker container configuration
├── docker-compose.yml      # Docker Compose service definition
├── packages.json          # NPM dependencies
├── .meteor/               # Meteor configuration
├── client/                # Client-side code
├── server/                # Server-side code
├── lib/                   # Shared code
├── public/                # Public assets and data files
└── private/               # Server-only assets
```

## Step 1: Build the Docker Image

Build the Docker container with all dependencies:

```powershell
docker-compose build
```

This will:

-   Use Ubuntu 16.04 as base
-   Install Node.js 4.8.4
-   Install Meteor 1.4.1.1
-   Install MongoDB client tools (mongodump, mongorestore)
-   Set up UTF-8 locale

## Step 2: Start the Container

Start the container in detached mode:

```powershell
docker-compose up -d
```

This creates and starts the `meteor1411` container with:

-   Port 3000 mapped to host
-   Current directory mounted to `/app` in container
-   Interactive bash shell running

## Step 3: Access the Container

Enter the container's bash shell:

```powershell
docker exec -it meteor1411 bash
```

You should see a prompt like: `root@<container-id>:/app#`

## Step 4: Start Meteor

Inside the container, start the Meteor development server:

```bash
meteor
```

Wait for Meteor to start. You should see:

```
[[[[[ /app ]]]]]

=> Started proxy.
=> Started MongoDB.
=> Started your app.

=> App running at: http://localhost:3000/
```

**Note:** You may see some warnings about CJKLib initialization or GB2312 character counts - these are normal and won't prevent the app from running.

## Step 5: Access the Application

Open your web browser and navigate to:

```
http://localhost:3000
```

The Make Me a Hanzi editor interface should load.

## Step 6: Using the Application

### Keyboard Shortcuts

The editor require following keyboard shortcuts for navigation:

#### Character Navigation

-   **`a`** : Show previous character
-   **`A`** : Show previous **unfinished** character
-   **`q`** : Show previous **completed** character
-   **`d`** : Show next character
-   **`D`** : Show next **unfinished** character
-   **`e`** : Show next **completed** character

#### Workflow Navigation

-   **`r`** : Reset current operation
-   **`s`** : Proceed to the next step
-   **`w`** : Go back to the previous step

### Character Completion Workflow

Completing a character involves six steps:

1. **Path** - Define the basic outline/paths from font data
2. **Bridges** - Connect stroke segments
3. **Strokes** - Define individual strokes
4. **Analysis** - Analyze stroke relationships
5. **Order** - Define stroke order
6. **Verified** - Mark as complete and verified

Use **`s`** to move forward through these steps and **`w`** to go back.

## Step 7: Using Meteor Methods from Browser Console

Open your browser's Developer Console (F12) and you can execute various commands:

### Backup Database

Create a backup of the MongoDB database:

```javascript
Meteor.call("backup", (err, res) => console.log(err || res));
```

Output: `"Backup started to /app/server/backup - check server console for progress"`

The backup will be saved to `server/backup/` directory.

### Export Verified Glyphs to JSON

Export all verified glyphs to `dictionary.txt` and `graphics.txt`:

```javascript
Meteor.call("export", (err, res) => console.log(err || res));
```

Output: `"Export started - check server console for progress"`

This creates:

-   `dictionary.txt` - Character metadata (definition, pinyin, etymology, etc.)
-   `graphics.txt` - Stroke graphics data (SVG paths, medians)

### Export SVG Files

Export individual SVG files for each verified glyph:

```javascript
Meteor.call("exportSVGs", (err, res) => console.log(err || res));
```

Output: `"SVG export started - check server console for progress"`

This creates a `.svgs/` directory with files named by Unicode codepoint (e.g., `20013.svg` for 中).

### Restore Database

Restore database from a previous backup:

```javascript
Meteor.call("restore", (err, res) => console.log(err || res));
```

Output: `"Restore started from /app/server/backup - check server console for progress"`

## Step 8: Monitoring Progress

All detailed progress logs appear in the **Meteor server console** (the terminal where you ran `meteor`).

Example server console output:

```
I20251106-05:28:09.888(0)? Starting SVG export...
I20251106-05:28:09.889(0)? Exporting first glyph: 为 (U+4E3A)
I20251106-05:28:09.890(0)? SVG export complete. Exported: 3, Skipped: 0
```

## Managing the Meteor Server

### Stop Meteor

Inside the container, press `Ctrl+C` to stop the Meteor server.

Or from outside the container:

```powershell
docker exec meteor1411 pkill -f meteor
```

### Restart Meteor

After stopping, simply run:

```bash
meteor
```

Meteor will automatically detect file changes and hot-reload during development.

### Reset Database

To completely reset the local database:

```bash
meteor reset
meteor
```

**Warning:** This deletes all local data!

## Container Management

### View Container Logs

```powershell
docker logs meteor1411
```

### View Running Processes in Container

```powershell
docker exec meteor1411 ps aux
```

### Stop the Container

```powershell
docker-compose down
```

Or:

```powershell
docker stop meteor1411
```

### Restart the Container

```powershell
docker restart meteor1411
```

### Rebuild Container (after Dockerfile changes)

```powershell
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## File Access

All project files are mounted from your host machine to `/app` in the container. Changes you make on your host are immediately visible in the container and vice versa.

### Access files from host

-   `C:\Dev\makemeahanzi\` (Windows)
-   Backed up data: `C:\Dev\makemeahanzi\server\backup\`
-   Exported files: `C:\Dev\makemeahanzi\dictionary.txt`, `C:\Dev\makemeahanzi\graphics.txt`
-   SVG exports: `C:\Dev\makemeahanzi\.svgs\`

### Access files from container

```bash
# Inside container
ls -la /app
cd /app/server/backup
```

## Troubleshooting

### Port 3000 already in use

If you see "Can't listen on port 3000", another process is using that port.

Find and stop the conflicting process, or change the port in `docker-compose.yml`:

```yaml
ports:
    - "3001:3000" # Map host port 3001 to container port 3000
```

### MongoDB connection errors

If you see MongoDB connection errors, ensure the container has enough memory:

```powershell
docker stats meteor1411
```

MongoDB requires at least 1GB of RAM.

### Empty SVG exports

If SVG exports are empty, ensure:

1. Glyphs have been fully verified in the editor
2. Glyphs have `stages.order` data
3. The `private/animation.html` template is properly configured
4. Restart Meteor after any template changes

### File permission issues

If you encounter permission issues with mounted volumes on Windows, ensure:

1. Docker Desktop has access to the drive
2. The project directory is in a shared location

## Development Workflow

1. **Start container**: `docker-compose up -d`
2. **Start Meteor**: `docker exec -it meteor1411 bash` → `meteor`
3. **Edit files** on your host machine (changes auto-reload)
4. **Test changes** at `http://localhost:3000`
5. **Run commands** from browser console
6. **Monitor logs** in Meteor terminal
7. **Stop gracefully**: `Ctrl+C` in Meteor terminal
8. **Stop container**: `docker-compose down`

## Docker Configuration Details

### Dockerfile Configuration

-   **Base Image**: Ubuntu 16.04
-   **Meteor Version**: 1.4.1.1 (legacy)
-   **Node.js**: Version 4.8.4
-   **MongoDB Tools**: mongodump, mongorestore
-   **Special Settings**: `NODE_TLS_REJECT_UNAUTHORIZED=0` for legacy packages

### docker-compose.yml Configuration

-   **Service Name**: meteor1411
-   **Container Name**: meteor1411
-   **Command**: bash (interactive shell)
-   **Ports**: 3000:3000
-   **Volume**: `./:/app` (bind mount)
-   **Working Directory**: `/app`

## Additional Resources

-   [Meteor Documentation](https://docs.meteor.com/)
-   [Make Me a Hanzi GitHub](https://github.com/skishore/makemeahanzi)
-   [Docker Documentation](https://docs.docker.com/)

## Common Meteor Commands

```bash
# Inside container
meteor                    # Start development server
meteor reset             # Reset database
meteor mongo             # Open MongoDB shell
meteor npm install       # Install npm packages
meteor add <package>     # Add Meteor package
meteor remove <package>  # Remove Meteor package
meteor update            # Update packages
```

## Notes

-   This is a **legacy Meteor 1.4.1** application running on Node 4.8.4
-   Hot-reload is enabled by default in development mode
-   The MongoDB database is stored in `.meteor/local/db/` inside the container
-   Backups are portable and can be restored to any MongoDB instance
-   All exports (dictionary.txt, graphics.txt, .svgs/) are created in the project root

---

**Last Updated**: November 6, 2025
